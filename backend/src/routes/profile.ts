import { Router } from 'express';
import prisma from '../prisma';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';

// import { deleteDriveFile } from '../google/drive';


const router = Router();


// Turn stored filePath into a public <img> URL
const normalizePublic = (p?: string | null) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p; // already public
  const m = p.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
  return m ? `https://drive.google.com/uc?id=${encodeURIComponent(m[1])}&export=view` : null;
};



/* ----------------- helpers ----------------- */

function kindToDocType(kind: string) {
  switch ((kind || '').toLowerCase()) {
    case 'acceptance_letter':  return 'ACCEPTANCE_LETTER';
    case 'learning_agreement': return 'LEARNING_AGREEMENT';
    case 'passport_id':        return 'ID_PASSPORT';
    case 'cv':                 return 'CV';
    default: throw new Error('invalid_kind');
  }
}


function extractDriveId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const m = String(url).match(/[?&]id=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    const m2 = String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m2) return m2[1];
    return null;
  } catch { return null; }
}



function foldDocs(
  rows: Array<{
    documentType: string;
    filePath: string | null;
    fileName?: string | null;
    expiryDate?: Date | null;
  }>
) {
  const by = new Map(rows.map(r => [r.documentType, r]));
  const other = rows.find(r => r.documentType === 'OTHER');
  const linkedin =
    other && (other.fileName?.toLowerCase() === 'linkedin' || (other.filePath || '').includes('linkedin.com'))
      ? (other.filePath ?? null)
      : null;

  return {
    acceptanceLetter:  by.get('ACCEPTANCE_LETTER')?.filePath ?? null,
    learningAgreement: by.get('LEARNING_AGREEMENT')?.filePath ?? null,
    passportId:        by.get('ID_PASSPORT')?.filePath ?? null,
    passportExpiryDate: by.get('ID_PASSPORT')?.expiryDate ?? null, // NEW
    cv:                by.get('CV')?.filePath ?? null,
    linkedin,
  };
}

function extractDriveFileId(url?: string | null): string | null {
  if (!url) return null;
  const m1 = url.match(/[?&]id=([^&]+)/);           // uc?id=FILE_ID
  if (m1) return decodeURIComponent(m1[1]);
  const m2 = url.match(/\/file\/d\/([^/]+)/);       // /file/d/FILE_ID/
  if (m2) return m2[1];
  const m3 = url.match(/\/api\/uploads\/drive\/file\/([^/?]+)/); // proxy
  if (m3) return m3[1];
  return null;
}


// Convert any Google Drive link to our protected proxy URL.
// If it's already our proxy, return as-is.
const toProxyUrl = (u?: string | null) => {
  if (!u) return null;
  // already our proxy?
  const m3 = u.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
  if (m3) return `/api/uploads/drive/file/${encodeURIComponent(m3[1])}?name=avatar`;
  // google drive: uc?id=... or /file/d/...
  const m1 = u.match(/[?&]id=([^&]+)/);
  if (m1) return `/api/uploads/drive/file/${encodeURIComponent(decodeURIComponent(m1[1]))}?name=avatar`;
  const m2 = u.match(/\/file\/d\/([^/]+)/);
  if (m2) return `/api/uploads/drive/file/${encodeURIComponent(m2[1])}?name=avatar`;
  // anything else (http/https) – return as-is
  return u;
};



/* ----------------- PROFILE: GET /api/profile ----------------- */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const employee = await prisma.employeeDetail.findFirst({ where: { userId } });

    if (!employee) {
      return res.json({
        firstName: user.firstName,
        surname: user.surname,
        role: user.role,
        empType: user.empType, 
        companyEmail: user.companyEmail,
        personalEmail: null,
        nationality: null,
        gender: null,
        birthdate: null,
        phone: null,
        supervisor: null,
        startDate: null,
        endDate: null,
        status: null,
        department: null,
        position: null,
        avatarUrl: null,
        sos: { relativePhoneNumber: null, relationWithEmployee: null },
        documents: { acceptanceLetter: null, learningAgreement: null, passportId: null, cv: null, linkedin: null },
      });
    }

    const employment = await prisma.employeeInfo.findFirst({
      where: { employeeId: employee.employeeId },
      orderBy: [{ startDate: 'desc' }],
      include: { department: true, position: true },
    });

    const sos = await prisma.employeeSosDetail.findFirst({
      where: { employeeId: employee.employeeId },
      select: { relativePhoneNumber: true, relationWithEmployee: true },
    });

    const docsRows = await prisma.employeeDocument.findMany({
  where: { employeeId: employee.employeeId, isActive: true },
  select: { documentType: true, filePath: true, fileName: true, expiryDate: true }, // NEW
});


    // turn any Google Drive link into our protected proxy URL


    

const avatarDoc = docsRows.find(r => r.documentType === 'PROFILE_PICTURE');
const avatarUrl = toProxyUrl(avatarDoc?.filePath ?? null);

return res.json({
      firstName: user.firstName,
      surname: user.surname,
      role: user.role,
      empType: user.empType, 
      companyEmail: user.companyEmail,
      personalEmail: employee.email,
      nationality: employee.nationality,
      gender: employee.gender,
      birthdate: employee.birthdate,
      phone: employee.phone,
      supervisor: employment?.supervisor ?? null,
      startDate: employment?.startDate ?? null,
      endDate: employment?.endDate ?? null,
      status: employment?.status ?? null,
      department: employment?.department?.departmentName ?? null,
      position: employment?.position?.name ?? null,
      avatarUrl,
      sos: {
        relativePhoneNumber: sos?.relativePhoneNumber ?? null,
        relationWithEmployee: sos?.relationWithEmployee ?? null,
      },
      documents: foldDocs(docsRows),
    });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to load profile' });
  }
});

/* ----------------- ADMIN docs for /admin/document-management ----------------- */

router.get(
  '/admin/documents/:employeeId',
  ensureAuthenticated,
  ...authorize('hr', 'super_admin'),
  async (req, res) => {
    try {
      const employeeId = String(req.params.employeeId);
      const rows = await prisma.employeeDocument.findMany({
        where: { employeeId, isActive: true },
        select: { documentType: true, filePath: true, fileName: true },
      });
      const avatarRaw = rows.find(r => r.documentType === 'PROFILE_PICTURE')?.filePath ?? null;
const avatarUrl = toProxyUrl(avatarRaw);
return res.json({ avatarUrl, documents: foldDocs(rows as any) });



    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed' });
    }
  }
);

// replace old admin complete route with this one
router.post(
  '/admin/documents/:employeeId/:kind/complete',
  ensureAuthenticated,
  ...authorize('hr', 'super_admin'),
  async (req, res) => {
    try {
      const employeeId = String(req.params.employeeId);
      const kind     = String(req.params.kind);
      const { url, fileId, originalName, mimeType, fileSize } = req.body || {};
      if (!url) return res.status(400).json({ error: 'url required' });

      // map kind -> Prisma enum
      const documentType = kindToDocType(kind);

      // 1) read previous file (if any) BEFORE we write the new row
      const prev = await prisma.employeeDocument.findUnique({
        where: { employee_document_per_type: { employeeId, documentType } },
        select: { filePath: true },
      });

      // helper that extracts a Drive file id from our stored URL
      const extractDriveFileId = (u?: string | null) => {
        if (!u) return null;
        const m1 = u.match(/[?&]id=([^&]+)/);                    // uc?id=FILE_ID
        if (m1) return decodeURIComponent(m1[1]);
        const m2 = u.match(/\/file\/d\/([^/]+)/);                // /file/d/FILE_ID/
        if (m2) return m2[1];
        const m3 = u.match(/\/api\/uploads\/drive\/file\/([^/?]+)/); // our proxy
        if (m3) return m3[1];
        return null;
      };

      const prevId = extractDriveFileId(prev?.filePath);
      const newId  = extractDriveFileId(url);

      // 2) upsert the document record with the NEW file
      await prisma.employeeDocument.upsert({
        where: { employee_document_per_type: { employeeId, documentType } },
        update: {
          fileName:     String(fileId || originalName || `document_${kind}`),
          originalName: String(originalName || fileId || `document_${kind}`),
          filePath:     String(url),
          fileSize:     Number(fileSize || 0),
          mimeType:     String(mimeType || 'application/octet-stream'),
          isActive:     true,
          updatedAt:    new Date(),
          status:       'pending',
        },
        create: {
          employeeId,
          documentType,
          fileName:     String(fileId || originalName || `document_${kind}`),
          originalName: String(originalName || fileId || `document_${kind}`),
          filePath:     String(url),
          fileSize:     Number(fileSize || 0),
          mimeType:     String(mimeType || 'application/octet-stream'),
          isRequired:   true,
          status:       'pending',
          isActive:     true,
        },
      });

      // 3) best-effort delete of the OLD Drive file, if it’s different
      if (prevId && prevId !== newId) {
        try {
          const ok = await (await import('../google/drive')).deleteDriveFile(prevId);
          if (!ok) console.warn('[admin-docs] previous file not deleted or not ours:', prevId);
        } catch (e) {
          console.warn('[admin-docs] delete old file failed (ignored):', e);
        }
      }

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'save_failed' });
    }
  }
);


/* ----------------- SELF actions used by /profile page ----------------- */

// Save avatar URL into PROFILE_PICTURE (delete old one first if we own it)
router.post('/avatar/complete', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    const { url, fileId, originalName, mimeType, fileSize } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    if (!url)   return res.status(400).json({ error: 'url required' });

    const employee = await prisma.employeeDetail.findFirst({ where: { userId } });
    if (!employee) return res.status(400).json({ error: 'employee_not_found' });

    // fetch existing avatar row to delete old file from Drive
    const existing = await prisma.employeeDocument.findFirst({
      where: { employeeId: employee.employeeId, documentType: 'PROFILE_PICTURE', isActive: true },
      select: { filePath: true },
    });
    const prevId = extractDriveId(existing?.filePath);
    const newId  = extractDriveId(url);

    if (prevId && prevId !== newId) {
      // best-effort delete (doesn't throw if it fails)
      try { const { deleteDriveFile } = await import('../google/drive'); await deleteDriveFile(prevId); } catch {}
    }

    await prisma.employeeDocument.upsert({
      where: { employee_document_per_type: { employeeId: employee.employeeId, documentType: 'PROFILE_PICTURE' } },
      update: {
        fileName:     String(fileId || originalName || 'avatar'),
        originalName: String(originalName || fileId || 'avatar'),
        filePath:     String(url),
        fileSize:     Number(fileSize || 0),
        mimeType:     String(mimeType || 'application/octet-stream'),
        isActive:     true,
        updatedAt:    new Date(),
        status:       'pending',
      },
      create: {
        employeeId:   employee.employeeId,
        documentType: 'PROFILE_PICTURE',
        fileName:     String(fileId || originalName || 'avatar'),
        originalName: String(originalName || fileId || 'avatar'),
        filePath:     String(url),
        fileSize:     Number(fileSize || 0),
        mimeType:     String(mimeType || 'application/octet-stream'),
        isRequired:   false,
        status:       'pending',
        isActive:     true,
      },
    });

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'avatar_save_failed' });
  }
});




// Save a personal document for the logged-in employee
router.post('/documents/:kind/complete', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    const kind = String(req.params.kind);
    const { url, fileId, originalName, mimeType, fileSize } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    if (!url)   return res.status(400).json({ error: 'url required' });

    const employee = await prisma.employeeDetail.findFirst({ where: { userId } });
    if (!employee) return res.status(400).json({ error: 'employee_not_found' });

    const documentType = kindToDocType(kind);

    await prisma.employeeDocument.upsert({
      where: { employee_document_per_type: { employeeId: employee.employeeId, documentType } },
      update: {
        fileName:     String(fileId || originalName || `document_${kind}`),
        originalName: String(originalName || fileId || `document_${kind}`),
        filePath:     String(url),
        fileSize:     Number(fileSize || 0),
        mimeType:     String(mimeType || 'application/octet-stream'),
        isActive:     true,
        updatedAt:    new Date(),
        status:       'pending',
      },
      create: {
        employeeId:   employee.employeeId,
        documentType,
        fileName:     String(fileId || originalName || `document_${kind}`),
        originalName: String(originalName || fileId || `document_${kind}`),
        filePath:     String(url),
        fileSize:     Number(fileSize || 0),
        mimeType:     String(mimeType || 'application/octet-stream'),
        isRequired:   true,
        status:       'pending',
        isActive:     true,
      },
    });

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'doc_save_failed' });
  }
});

// Save SOS
router.put('/sos', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    const { relativePhoneNumber, relationWithEmployee } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const employee = await prisma.employeeDetail.findFirst({ where: { userId } });
    if (!employee) return res.status(400).json({ error: 'employee_not_found' });

    const existing = await prisma.employeeSosDetail.findFirst({ where: { employeeId: employee.employeeId } });
    if (existing) {
      await prisma.employeeSosDetail.update({
        where: { id: existing.id },
        data: {
          relativePhoneNumber: relativePhoneNumber || null,
          relationWithEmployee: relationWithEmployee || null,
        },
      });
    } else {
      await prisma.employeeSosDetail.create({
        data: {
          employeeId: employee.employeeId,
          relativePhoneNumber: relativePhoneNumber || null,
          relationWithEmployee: relationWithEmployee || null,
        },
      });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'sos_save_failed' });
  }
});

// Save Social (LinkedIn) – stored as OTHER doc with fileName 'linkedin'
router.put('/social', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    const { linkedin } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const employee = await prisma.employeeDetail.findFirst({ where: { userId } });
    if (!employee) return res.status(400).json({ error: 'employee_not_found' });

    if (linkedin && String(linkedin).trim()) {
      await prisma.employeeDocument.upsert({
        where: { employee_document_per_type: { employeeId: employee.employeeId, documentType: 'OTHER' } },
        update: {
          fileName: 'linkedin',
          originalName: 'linkedin',
          filePath: String(linkedin),
          fileSize: 0,
          mimeType: 'text/url',
          isActive: true,
          updatedAt: new Date(),
          status: 'pending',
        },
        create: {
          employeeId: employee.employeeId,
          documentType: 'OTHER',
          fileName: 'linkedin',
          originalName: 'linkedin',
          filePath: String(linkedin),
          fileSize: 0,
          mimeType: 'text/url',
          isRequired: false,
          status: 'pending',
          isActive: true,
        },
      });
    } else {
      // clear it if empty
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: employee.employeeId, documentType: 'OTHER' },
      });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'social_save_failed' });
  }
});

export default router;
