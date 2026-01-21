// backend/src/routes/gsuite.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma';
import { authorize } from '../middleware/authorize';
import { ensureUser, addMemberToGroup, getAuth } from '../google/admin';
import { googleDeleteUser } from '../google/deletion';
import { sendProvisioningEmail } from '../lib/mailer';
import { Prisma, InternshipStatus, $Enums } from '@prisma/client';
import { getSystemConfig } from '../lib/systemConfig';



import { google } from 'googleapis';

const router = Router();

// Fallback only; main values now come from SystemConfig
const DEFAULT_DOMAIN =
  process.env.GOOGLE_WORKSPACE_DOMAIN ||
  process.env.COMPANY_EMAIL_DOMAIN ||
  'extramus.eu';

// ---------- helpers ----------
function generatePassword(len = 12) {

  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function capWord(s: string) {
  const t = (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
}
function letters2(s: string) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 2)
    .toLowerCase() || 'xx';
}

async function genEmailAndEmpId(
  tx: Prisma.TransactionClient,
  firstName: string,
  surname: string,
  departmentName: string,
  domain: string
): Promise<{ email: string; empId: string }> {
  const first = capWord(firstName);
  const surFirst = capWord(String(surname).split(/[\s-]+/)[0]);
  const d2 = letters2(departmentName);
  if (!first || !surFirst) throw new Error('Invalid name');

  for (let i = 0; i < 60; i++) {
    const n = Math.floor(10000 + Math.random() * 90000); // 5 digits
    const empId = `${d2}${n}`;
    const emailLower = `${first}${surFirst}.${empId}@${domain}`.toLowerCase();

    const hit = await tx.user.findFirst({
      where: { OR: [{ companyEmail: emailLower }, { empId }] },
      select: { id: true },
    });
    if (!hit) return { email: emailLower, empId };
  }
  throw new Error('Could not generate unique company email/empId');
}

// ---------- routes ----------

// Create portal user + intern rows + optional Google account
router.post(
  '/provision/auto',
  authorize('hr', 'super_admin'),
  
  async (req: Request, res: Response) => {
    try {
      console.log('[gsuite] provision/auto: start', { 
        firstName: req.body?.firstName,
        surname: req.body?.surname,
        departmentId: req.body?.departmentId,
        positionId: req.body?.positionId,
      });


      const {
        firstName,
        surname,
        personalEmail,
        nationality,
        gender,
        birthdate,
        phone,
        departmentId,
        positionId,
        joiningDate,
        endDate,
        supervisor,
      } = req.body ?? {};

      const rawEmp = String(req.body?.empType ?? req.body?.emp_type ?? '').toLowerCase();
// default to 'intern' if missing/invalid
const empType: $Enums.EmpType =
  rawEmp === 'intern' || rawEmp === 'employee' || rawEmp === 'team_lead'
    ? (rawEmp as $Enums.EmpType)
    : 'intern';

      if (
        !firstName ||
        !surname ||
        !personalEmail ||
        !departmentId ||
        !positionId ||
        !joiningDate
      ) {
        return res.status(400).json({ ok: false, error: 'Missing required fields' });
      }
      const dept = await prisma.department.findUnique({
        where: { id: Number(departmentId) },
        select: { departmentName: true },
      });
      if (!dept) return res.status(400).json({ ok: false, error: 'Invalid departmentId' });

// --- PRE-CHECK: personal email uniqueness (case-insensitive) ---
const personalEmailNorm = String(personalEmail || '').trim().toLowerCase();
if (!personalEmailNorm) {
  return res.status(400).json({ ok: false, error: 'Personal email required' });
}
const existing = await prisma.internDetail.findFirst({
  where: { email: { equals: personalEmailNorm, mode: 'insensitive' } },
  select: {
    internId: true,
    user: { select: { firstName: true, surname: true, companyEmail: true } },
  },
});
if (existing) {
  const who = existing.user
    ? `${existing.user.firstName} ${existing.user.surname}${existing.user.companyEmail ? ` (${existing.user.companyEmail})` : ''}`
    : 'another intern';
  return res.status(409).json({
    ok: false,
    error: `That personal email is already used by ${who}.`,
    code: 'personal_email_exists',
  });
}

const siteTempPassword = generatePassword(12);

      const googleTempPassword = generatePassword(12);
      const siteHash = await bcrypt.hash(siteTempPassword, 12);

            let companyEmail = '';
      let empId = '';
      let newUserId = 0;
      let internUUID = '';

      // load domain from DB config once per request
      const sys = await getSystemConfig();
      const domain =
        sys.googleWorkspaceDomain ||
        sys.companyEmailDomain ||
        DEFAULT_DOMAIN;

      // Capture creation tracking info
      const createdByUserId = (req as any)?.user?.id ?? null;
      const creatorUser = createdByUserId 
        ? await prisma.user.findUnique({
            where: { id: createdByUserId },
            select: { role: true, empType: true }
          })
        : null;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || (req.headers['x-real-ip'] as string) 
        || req.socket?.remoteAddress 
        || null;
      const userAgent = req.headers['user-agent'] || null;

      await prisma.$transaction(async (tx) => {
        const { email: genEmail, empId: genEmpId } = await genEmailAndEmpId(
          tx,
          firstName,
          surname,
          dept.departmentName,
          domain
        );
        companyEmail = genEmail; // already lowercase
        empId = genEmpId;

        const user = await tx.user.create({
          data: {
            firstName,
            surname,
            companyEmail,
            password: siteHash,
            role: 'intern',
            empId,
            empType,
            createdBy: createdByUserId,
            createdByRole: creatorUser?.role || null,
            createdByEmpType: creatorUser?.empType || null,
            creationIp: ip?.substring(0, 45) || null,
            creationUserAgent: userAgent?.substring(0, 255) || null,
            creationMethod: 'google_workspace',
          },
          select: { id: true },
        });
        newUserId = user.id;

        const intern = await tx.internDetail.create({
          data: {
            userId: newUserId,
            name: `${capWord(firstName)} ${capWord(surname)}`,
            nationality: nationality || null,
            gender: gender || null,
            birthdate: birthdate ? new Date(birthdate) : null,
            email: personalEmailNorm,
            phone: phone || null,
          },
          select: { internId: true },
        });
        internUUID = intern.internId;

        await tx.internshipInfo.create({
          data: {
            internId: intern.internId,
            departmentId: Number(departmentId),
            positionId: Number(positionId),
            startDate: joiningDate ? new Date(joiningDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            supervisor: supervisor || null,
            status: InternshipStatus.Active,
          },
        });
      });


      console.log('[gsuite] creating Google user for', companyEmail);

      // Google Workspace user
      // Google Workspace user
let googleCreated = false;
let googleError: string | null = null;
try {
  const out = await ensureUser({
    primaryEmail: companyEmail,
    givenName: firstName,
    familyName: surname,
    password: googleTempPassword,
    changePasswordAtNextLogin: true,
    orgUnitPath: process.env.GOOGLE_ORG_UNIT_PATH || undefined, // optional
  });

    googleCreated = out.created || !!out.user?.primaryEmail;

  // (optional) auto-add to an "all" group if configured in SystemConfig
  const allGroup = sys.googleAllGroup;

  if (googleCreated && allGroup) {
    try {
      await addMemberToGroup({
        groupEmail: allGroup,
        memberEmail: companyEmail,
      });
    } catch (e: any) {
      console.warn('[gsuite] addMemberToGroup failed:', e?.message || e);
    }
  }

} catch (e: any) {
  googleCreated = false;
  googleError = String(e?.message || e || 'Google user creation failed');
  console.error('[gsuite] ensureUser threw', googleError);
}


      // email
      let emailSent = false;
      try {
        emailSent = await sendProvisioningEmail({
          to: personalEmail,
          companyEmail,
          recipientName: `${firstName} ${surname}`.trim(),
          siteTempPassword,
          googlePassword: googleCreated ? googleTempPassword : undefined,
          googleCreated,
          googleError: googleError ?? undefined,
        });
      } catch {
        emailSent = false;
      }

      return res.json({
        ok: true,
        userId: newUserId,
        internId: internUUID,
        companyEmail,
        empId,
        tempPasswords: {
          site: siteTempPassword,
          google: googleCreated ? googleTempPassword : undefined,
        },
        google: { created: googleCreated, error: googleError },
        email: { sent: emailSent },
      });
      
        } catch (e: any) {
  // Prisma unique constraint (duplicate)
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = (e.meta?.target ?? []) as string[] | string;
    const targets = Array.isArray(target) ? target : [String(target)];
    if (targets.some(t => /email/i.test(t))) {
      return res.status(409).json({
        ok: false,
        error: 'That personal email is already used by another intern.',
        code: 'personal_email_exists',
      });
    }
    if (targets.some(t => /companyemail|empid/i.test(t))) {
      return res.status(409).json({
        ok: false,
        error: 'Generated company email or EMP ID collided — please submit again.',
        code: 'company_email_or_empid_exists',
      });
    }
  }

  // Fallback: inspect message text just in case meta.target isn't present
  const msg = String(e?.message || '');
  if (/Unique constraint/i.test(msg) && /`email`/i.test(msg)) {
    return res.status(409).json({
      ok: false,
      error: 'That personal email is already used by another intern.',
      code: 'personal_email_exists',
    });
  }

  return res.status(500).json({ ok: false, error: 'Provision failed' });
}


  }
  
);

// Retry only Google Workspace account creation for an existing portal user.
// - Does NOT create a new portal user or intern.
// - Uses the already generated companyEmail from the database.
// - Sends a separate email with the Google credentials if it succeeds.
router.post(
  '/provision/retry/google',
  authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
       const sys = await getSystemConfig();
      const allGroup = sys.googleAllGroup;
      const rawEmail = req.body?.companyEmail;
      if (!rawEmail || typeof rawEmail !== 'string') {
        return res.status(400).json({ ok: false, error: 'companyEmail is required' });
      }

      const companyEmail = rawEmail.trim().toLowerCase();

      // 1) Load the existing portal user by companyEmail
      const user = await prisma.user.findUnique({
        where: { companyEmail },
        include: {
          internDetails: {
            select: { email: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: 'Portal user not found for this company email',
        });
      }

      const givenName = user.firstName;
      const familyName = user.surname;

      // Prefer the intern's personal email; fall back to company email
      const personalEmail =
        user.internDetails?.[0]?.email || user.companyEmail;

      // 2) Try Google Workspace creation again for THIS companyEmail
      const googleTempPassword = generatePassword(12);

      let googleCreated = false;
      let googleError: string | null = null;

      try {
        const out = await ensureUser({
          primaryEmail: companyEmail,
          givenName,
          familyName,
          password: googleTempPassword,
          changePasswordAtNextLogin: true,
          orgUnitPath: process.env.GOOGLE_ORG_UNIT_PATH || undefined,
        });

                googleCreated = out.created || !!out.user?.primaryEmail;

        // Add to global group if configured in SystemConfig
        if (googleCreated && allGroup) {
          try {
            await addMemberToGroup({
              groupEmail: allGroup,
              memberEmail: companyEmail,
            });
          } catch (e: any) {
            console.warn(
              '[gsuite] /provision/retry/google addMemberToGroup failed:',
              e?.message || e
            );
          }
        }

      } catch (e: any) {
        googleCreated = false;
        googleError = String(e?.message || e || 'Google user creation failed');
        console.error('[gsuite] /provision/retry/google ensureUser', googleError);
      }

      // 3) Send a separate email only with Google credentials (no new site user)
      let emailSent = false;
      if (personalEmail && googleCreated) {
        try {
          emailSent = await sendProvisioningEmail({
            to: personalEmail,
            companyEmail,
            siteTempPassword: undefined,          // no new site password
            googlePassword: googleCreated ? googleTempPassword : undefined,         // new Google password
            googleCreated,
            googleError: googleError ?? undefined,
            subject: 'Your Google Workspace account',
          });
        } catch {
          emailSent = false;
        }
      }

      return res.json({
        ok: googleCreated,
        companyEmail,
        tempPasswords: {
          site: undefined,
          google: googleCreated ? googleTempPassword : undefined,
        },
        google: { created: googleCreated, error: googleError },
        email: { sent: emailSent },
      });
    } catch (e: any) {
      console.error('[gsuite] /provision/retry/google failed', e);
      return res.status(500).json({
        ok: false,
        error: e?.message || 'Google retry failed',
      });
    }
  }
);




// Google deletions
router.post(
  '/users/delete',
  authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const b = (req.body || {}) as {
        fromEmail?: string;
        email?: string;
        primaryEmail?: string;
        transferToEmail?: string;
      };
      const userKey = (b.fromEmail || b.email || b.primaryEmail || '').trim();
      if (!userKey) return res.status(400).json({ ok: false, error: 'email required' });

      const { ok: _ok, ...rest } = await googleDeleteUser({
        fromEmail: userKey,
        transferToEmail: b.transferToEmail?.trim() || undefined,
      });
      return res.json({ ok: true, deleted: true, ...rest });
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e?.message || 'Google delete failed' });
    }
  }
);

router.post(
  '/delete',
  ...authorize('hr', 'super_admin'),
  async (req, res, next) => {
    try {
      const { email, transferToEmail } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ ok: false, error: 'email required' });
      }
      const result = await googleDeleteUser({
        fromEmail: email.trim(),
        transferToEmail: transferToEmail ? String(transferToEmail).trim() : undefined,
      });
      return res.json(result);
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/deprovision/delete',
  authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    (req as any).body = {
      ...req.body,
      fromEmail: req.body?.fromEmail || req.body?.email || req.body?.primaryEmail,
    };
    return (router as any).handle({ ...req, url: '/users/delete', method: 'POST' }, res);
  }
);

router.post(
  '/users/delete-list',
  authorize('super_admin'),
  async (req: Request, res: Response) => {
    const { emails, transferToEmail } = (req.body ?? {}) as {
      emails?: string[];
      transferToEmail?: string;
    };
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails[] required' });
    }

    const clean = emails.map((e) => String(e || '').trim()).filter(Boolean);
    const results = await Promise.allSettled(
      clean.map((email) =>
        googleDeleteUser({
          fromEmail: email,
          transferToEmail: transferToEmail?.trim() || undefined,
        })
      )
    );

    const summary = results.map((r, i) =>
      r.status === 'fulfilled'
        ? { email: clean[i], ok: true, transferId: r.value.transferId ?? undefined }
        : { email: clean[i], ok: false, error: String((r as any).reason?.message ?? (r as any).reason) }
    );

    return res.json({ ok: true, deleted: summary.filter((s) => s.ok).length, results: summary });
  }
);




// probe 1: token ok?
router.get('/whoami', authorize('hr','super_admin'), async (_req, res) => {
  try { const auth = getAuth(); await auth.authorize(); res.json({ ok: true }); }
  catch (e:any) { res.status(400).json({ ok:false, error: String(e?.message||e) }); }
});

// probe 2: confirm super-admin readable + list Workspace domains

router.get('/probe', authorize('hr','super_admin'), async (_req,res)=>{
  try {
    const auth = getAuth(); await auth.authorize();
    const admin = google.admin({ version: 'directory_v1', auth });
    const doms = await admin.domains.list({ customer: 'my_customer' });
    res.json({ ok:true, domains:(doms.data.domains||[]).map(d=>d.domainName) });
  } catch(e:any){ res.status(400).json({ ok:false, error:e?.response?.data||e?.message||String(e) }); }
});


export const provisionAutoHandler = router;
export default router;
