import { Router, Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { streamDownload } from '../google/drive';

const router = Router();

/**
 * Public proxy to stream a Drive file by ID (no auth cookie required).
 * Example: /api/public/drive/file/<fileId>?name=avatar.jpg
 */
router.get('/drive/file/:id', async (req: Request, res: Response) => {
  const fileId = String(req.params.id);
  const name = String(req.query.name || 'file');
  try {
    await streamDownload(res, fileId, name);
  } catch (e: any) {
    res.status(404).json({ error: 'file_not_found', detail: e?.message });
  }
});

/**
 * Public list of interns for the directory page.
 * Returns minimal information + a public proxy URL for the avatar (if present).
 */
router.get('/interns', async (_req: Request, res: Response) => {
  const rows = await prisma.internshipInfo.findMany({
    include: {
      intern: { include: { documents: true } },
      department: true,
      position: true,
    },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });

  const now = Date.now();

  type PublicRow = {
    internId: number;
    name: string;
    firstName: string;
    surname: string;
    department: string | null;
    position: string | null;
    nationality: string | null;
    phone: string | null;
    email: string | null;
    startDate: string | null;
    endDate: string | null;
    status: 'current' | 'alumni';
    avatarUrl: string;
  };

  const items: PublicRow[] = rows.map((r) => {
    const doc = r.intern.documents || null;

    // We store avatar as '/api/uploads/drive/file/<id>?name=...'
    // For public, rewrite to '/api/public/drive/file/<id>?name=...'
    const stored = doc?.profilePicture || '';
    const avatarUrl = stored.includes('/api/uploads/drive/file/')
      ? stored.replace('/api/uploads/drive/file/', '/api/public/drive/file/')
      : '';

    const end = r.endDate ? r.endDate.getTime() : null;
    const status: 'current' | 'alumni' =
      end === null || end > now ? 'current' : 'alumni';

    return {
      internId: r.internId,
      name: r.intern.name,
      firstName: r.intern.name, // single-name field in schema
      surname: '',              // no separate surname in InternDetail
      department: r.department?.departmentName ?? null,
      position: r.position?.name ?? null,
      nationality: r.intern.nationality ?? null,
      phone: r.intern.phone ?? null,
      email: r.intern.personalEmail ?? null,
      startDate: r.startDate ? r.startDate.toISOString() : null,
      endDate: r.endDate ? r.endDate.toISOString() : null,
      status,
      avatarUrl,
    };
  });

  res.json({ items });
});

export default router;
