// backend/src/routes/avatar.ts
import { Router, Request, Response } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { prisma } from '../prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as any).user?.id ?? 'unknown');
    const dir = path.join(UPLOAD_ROOT, uid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '';
    cb(null, `${ts}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// POST /api/profile/avatar
router.post('/avatar', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const uid = Number((req as any).user.id);
    const relUrl = `/uploads/${uid}/${req.file.filename}`;

    // Upsert intern_documents.profilePicture
    await prisma.intern_documents.upsert({
      where: { internId: uid },
      create: { internId: uid, profilePicture: relUrl },
      update: { profilePicture: relUrl },
    });

    return res.json({ avatarUrl: relUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save avatar' });
  }
});

// POST /api/profile/documents/:kind
router.post('/documents/:kind', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const uid = Number((req as any).user.id);
    const { kind } = req.params as { kind: 'acceptance_letter' | 'learning_agreement' | 'passport_id' | 'cv' };
    const allowed = new Set(['acceptance_letter', 'learning_agreement', 'passport_id', 'cv']);
    if (!allowed.has(kind)) return res.status(400).json({ error: 'Invalid kind' });

    const relUrl = `/uploads/${uid}/${req.file.filename}`;

    await prisma.intern_documents.upsert({
      where: { internId: uid },
      create: {
        internId: uid,
        acceptanceLetter: kind === 'acceptance_letter' ? relUrl : null,
        learningAgreement: kind === 'learning_agreement' ? relUrl : null,
        passportId: kind === 'passport_id' ? relUrl : null,
        cv: kind === 'cv' ? relUrl : null,
      },
      update: {
        ...(kind === 'acceptance_letter' ? { acceptanceLetter: relUrl } : {}),
        ...(kind === 'learning_agreement' ? { learningAgreement: relUrl } : {}),
        ...(kind === 'passport_id' ? { passportId: relUrl } : {}),
        ...(kind === 'cv' ? { cv: relUrl } : {}),
      },
    });

    return res.json({ url: relUrl });
  } catch {
    return res.status(500).json({ error: 'Failed to save document' });
  }
});

export default router;
