// backend/src/routes/uploads.ts
import { Router } from 'express';
import multer from 'multer';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import prisma from '../prisma';
import { uploadToDrive, streamDownload, deleteDriveFile } from '../google/drive';
import { extractDriveId } from '../google/deletion';

const DRIVE_ID = process.env.GOOGLE_SHARED_DRIVE_ID;
const router = Router();

// allow up to 15 MB files; keep memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const PROFILE_DIR = 'profile_pictures';
const DOCS_DIR = 'employee_documents'; // keep consistent with UI

// --- Avatar upload ---
router.post('/drive/avatar', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'missing_file' });

    
if (!DRIVE_ID) return res.status(500).json({ error: 'missing_google_shared_drive_id' });

const up = await uploadToDrive({
  driveId: DRIVE_ID, // ✅ correct key
  folderPath: [PROFILE_DIR],
  filename: file.originalname || 'avatar',
  mimeType: file.mimetype || 'application/octet-stream',
  body: file.buffer,
});



    const url =
      up.url ||
      `/api/uploads/drive/file/${encodeURIComponent(up.fileId)}?name=${encodeURIComponent(file.originalname || 'file')}`;

    return res.json({ fileId: up.fileId, url });
    } catch (e: any) {
    console.error('[uploads] drive upload failed:', e);

    // googleapis errors often include response.data.error.message
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.error?.errors?.[0]?.message ||
      e?.errors?.[0]?.message ||
      e?.message ||
      'drive_upload_failed';

    return res.status(500).json({ error: msg });
  }

});

// --- Document upload ---
router.post('/drive/document/:kind', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const kind = String(req.params.kind || '').toLowerCase();
    if (!['acceptance_letter','learning_agreement','passport_id','cv'].includes(kind)) {
      return res.status(400).json({ error: 'invalid_kind' });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'missing_file' });

    // —— PDF only guard (MIME + magic header) ——
    const isPdfMime = (file.mimetype || '').toLowerCase() === 'application/pdf';
    const isPdfMagic = file.buffer && file.buffer.slice(0,5).toString() === '%PDF-';
    if (!(isPdfMime && isPdfMagic)) {
      return res.status(400).json({ error: 'only_pdf_allowed' });
    }

if (!DRIVE_ID) return res.status(500).json({ error: 'missing_google_shared_drive_id' });

const up = await uploadToDrive({
  driveId: DRIVE_ID, // ✅ correct key
  folderPath: [DOCS_DIR, kind],
  filename: file.originalname || `document_${kind}`, // ✅ don’t call docs “avatar”
  mimeType: file.mimetype || 'application/octet-stream',
  body: file.buffer,
});



        const url =
      up.url ||
      `/api/uploads/drive/file/${encodeURIComponent(up.fileId)}?name=${encodeURIComponent(
        file.originalname || 'file'
      )}`;

    // =========================
    // Optional DB save (Phase 1)
    // =========================
    // HR/super_admin should pass internId in multipart fields.
    // Interns can upload without internId; we’ll auto-resolve from their userId.
    const actor = (req as any).user as { id: number; role: 'intern' | 'hr' | 'super_admin' };

    const requestedInternId =
      typeof (req.body?.internId) === 'string' ? req.body.internId.trim() : '';

    let internId = requestedInternId;
    let myInternId: string | null = null;

    if (actor?.role === 'intern') {
      const me = await prisma.internDetail.findFirst({
        where: { userId: actor.id },
        select: { internId: true },
      });
      myInternId = me?.internId ?? null;

      if (!myInternId) {
        return res.status(400).json({ error: 'no_intern_profile' });
      }

      // Prevent interns from uploading under someone else’s internId
      if (requestedInternId && requestedInternId !== myInternId) {
        return res.status(403).json({ error: 'forbidden_intern_id' });
      }

      internId = myInternId;
    }

    // Accept expiryDate/expiresAt only for passport_id
    const rawExpiry =
      (req.body?.expiryDate ?? req.body?.expiresAt) !== undefined
        ? String(req.body.expiryDate ?? req.body.expiresAt).trim()
        : undefined;

    const parseDateOnly = (v: string): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
      return dt;
    };

    let expiryDateToSet: Date | null | undefined = undefined; // undefined => don’t change on update
    if (rawExpiry !== undefined) {
      if (rawExpiry === '') {
        expiryDateToSet = null;
      } else {
        const parsed = parseDateOnly(rawExpiry.slice(0, 10));
        if (!parsed) return res.status(400).json({ error: 'invalid_expiry_date' });
        expiryDateToSet = parsed;
      }
    }

    if (kind !== 'passport_id' && rawExpiry && rawExpiry !== '') {
      return res.status(400).json({ error: 'expiry_not_supported_for_kind' });
    }

    // Only save to DB if we know internId
    if (internId) {
      const docType =
        kind === 'cv'
          ? 'CV'
          : kind === 'passport_id'
          ? 'ID_PASSPORT'
          : kind === 'acceptance_letter'
          ? 'ACCEPTANCE_LETTER'
          : 'LEARNING_AGREEMENT';

      // Find any existing row (even if isActive=false) to avoid unique constraint issues
      const existing = await prisma.internDocument.findFirst({
        where: { internId, documentType: docType as any },
      });

      // If replacing an existing doc, try deleting the old Drive file
      if (existing?.filePath) {
        const oldId = extractDriveId(existing.filePath) || '';
        if (oldId && oldId !== up.fileId) {
          await deleteDriveFile(oldId);
        }
      }

      const commonData: any = {
        fileName: file.originalname || `document_${kind}.pdf`,
        originalName: file.originalname || `document_${kind}.pdf`,
        filePath: url,
        fileSize: file.size,
        mimeType: file.mimetype || 'application/pdf',
        uploadedAt: new Date(),

        // Reset status on re-upload
        status: 'pending',
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: null,

        // Ensure active again if it was disabled before
        isActive: true,

        // Reset expiry reminder tracking (these fields were added in Phase 0)
        expiryReminderLastSentAt: null,
        expiryReminderCount: 0,
      };

      // expiryDate rules
      if (kind === 'passport_id') {
        if (expiryDateToSet !== undefined) commonData.expiryDate = expiryDateToSet;
        else if (!existing) commonData.expiryDate = null; // create default
      } else {
        commonData.expiryDate = null;
      }

      const saved = existing
        ? await prisma.internDocument.update({
            where: { id: existing.id },
            data: {
              ...commonData,
              version: { increment: 1 },
            },
          })
        : await prisma.internDocument.create({
            data: {
              internId,
              documentType: docType as any,
              ...commonData,
            },
          });

      return res.json({
        fileId: up.fileId,
        url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        internDocument: saved,
      });
    }

    // Backwards-compatible: upload only (no DB write)
    return res.json({
      fileId: up.fileId,
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    } catch (e: any) {
    console.error('[uploads] drive upload failed:', e);

    // googleapis errors often include response.data.error.message
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.error?.errors?.[0]?.message ||
      e?.errors?.[0]?.message ||
      e?.message ||
      'drive_upload_failed';

    return res.status(500).json({ error: msg });
  }

});

// --- Proxy download (supports bearer in query ?token=...) ---
const authFromQuery = (req: any, res: any, next: any) => {
  if (req.headers.authorization) return ensureAuthenticated(req, res, next);
  const t = typeof req.query.token === 'string' ? req.query.token : '';
  if (t) req.headers.authorization = `Bearer ${t}`;
  return ensureAuthenticated(req, res, next);
};

router.get('/drive/file/:id', authFromQuery, async (req, res) => {
  const fileId = String(req.params.id);
  const filename = String(req.query.name || 'file');
  await streamDownload(res, fileId, filename);
});

/* =========================
 * Deletions (Drive + DB)
 * ========================= */

// helper: UI → Prisma enum
const KIND_TO_ENUM: Record<string, 'CV'|'ID_PASSPORT'|'ACCEPTANCE_LETTER'|'LEARNING_AGREEMENT'> = {
  cv: 'CV',
  passport_id: 'ID_PASSPORT',
  acceptance_letter: 'ACCEPTANCE_LETTER',
  learning_agreement: 'LEARNING_AGREEMENT',
};

// DELETE a single doc for an intern
// DELETE /api/uploads/drive/document/:internId/:kind
router.delete(
  '/drive/document/:internId/:kind',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req, res) => {
    try {
      const internId = String(req.params.internId);
      const kind = String(req.params.kind || '').toLowerCase();
      const enumType = KIND_TO_ENUM[kind];
      if (!enumType) return res.status(400).json({ error: 'invalid_kind' });

      const doc = await prisma.internDocument.findFirst({
        where: { internId, documentType: enumType as any, isActive: true },
      });
      if (!doc) return res.json({ ok: true, deleted: 0, driveDeleted: false });

      // try Drive delete (tolerate if already gone)
      const fileId = extractDriveId(doc.filePath || '') || '';
      const driveDeleted = fileId ? await deleteDriveFile(fileId) : true;

      // delete row
      await prisma.internDocument.delete({ where: { id: doc.id } });

      return res.json({ ok: true, deleted: 1, driveDeleted });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'delete_failed' });
    }
  }
);

// DELETE all 4 required docs for an intern
// DELETE /api/uploads/drive/documents/:internId/all
router.delete(
  '/drive/documents/:internId/all',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req, res) => {
    try {
      const internId = String(req.params.internId);
      const required = Object.values(KIND_TO_ENUM);

      const docs = await prisma.internDocument.findMany({
        where: { internId, documentType: { in: required as any }, isActive: true },
      });

      let driveDeleted = 0;
      for (const d of docs) {
        const fileId = extractDriveId(d.filePath || '') || '';
        if (!fileId) { driveDeleted += 1; continue; } // treat as OK if no id stored
        const ok = await deleteDriveFile(fileId);
        if (ok) driveDeleted += 1;
      }

      if (docs.length) {
        await prisma.internDocument.deleteMany({ where: { id: { in: docs.map(d => d.id) } } });
      }

      return res.json({ ok: true, deleted: docs.length, driveDeleted });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'bulk_delete_failed' });
    }
  }
);

// OPTIONAL: raw delete by Drive fileId (admin-only)
// DELETE /api/uploads/drive/file/:id
router.delete(
  '/drive/file/:id',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req, res) => {
    try {
      const fileId = String(req.params.id);
      const ok = await deleteDriveFile(fileId);
      return res.json({ ok });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'drive_delete_failed' });
    }
  }
);

export default router;
