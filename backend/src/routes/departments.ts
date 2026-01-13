import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authorize } from '../middleware/authorize';

const router = Router();

// --- Read: departments with positions (public for dropdowns)
router.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.department.findMany({
    orderBy: { id: 'asc' },
    include: { positions: { orderBy: { id: 'asc' }, select: { id: true, name: true } } },
  });
  res.json(rows);
});


// GET /api/departments/full  -> [{ id, departmentName, positions:[{id,name}] }]
router.get('/full', async (_req, res) => {
  const rows = await prisma.department.findMany({
    select: {
      id: true,
      departmentName: true,
      positions: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { departmentName: 'asc' },
  });
  res.json(rows);
});


// --- Create department with positions (HR + SA)
router.post('/', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const { departmentName, positions } = req.body as { departmentName: string; positions?: string[] };
  const name = (departmentName || '').trim();
  if (!name) return res.status(400).json({ error: 'departmentName required' });

  const pos = (positions || [])
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .map((p) => ({ name: p }));

  const row = await prisma.department.create({
    data: { departmentName: name, positions: { create: pos } },
    include: { positions: true },
  });
  res.json(row);
});

// --- Rename department
router.put('/:id', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { departmentName } = req.body as { departmentName: string };
  const name = (departmentName || '').trim();
  if (!name) return res.status(400).json({ error: 'departmentName required' });

  const row = await prisma.department.update({ where: { id }, data: { departmentName: name } });
  res.json(row);
});

// --- Delete department (only if unused)
router.delete('/:id', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const posIds = (await prisma.position.findMany({ where: { departmentId: id }, select: { id: true } }))
    .map((p) => p.id);

  const usedInInfo = await prisma.internshipInfo.count({ where: { OR: [{ departmentId: id }, { positionId: { in: posIds } }] } });
  const usedInReq  = await prisma.request.count({ where: { OR: [{ departmentId: id }, { positionId: { in: posIds } }] } });

  if (usedInInfo > 0 || usedInReq > 0) {
    return res.status(409).json({ error: 'Department or its positions are in use' });
  }

  await prisma.position.deleteMany({ where: { departmentId: id } });
  await prisma.department.delete({ where: { id } });
  res.json({ ok: true });
});

// --- Add position to a department
router.post('/:id/positions', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const departmentId = Number(req.params.id);
  const { name } = req.body as { name: string };
  const nm = (name || '').trim();
  if (!nm) return res.status(400).json({ error: 'name required' });

  const row = await prisma.position.create({ data: { departmentId, name: nm } });
  res.json(row);
});

// --- Rename position
router.put('/positions/:pid', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.pid);
  const { name } = req.body as { name: string };
  const nm = (name || '').trim();
  if (!nm) return res.status(400).json({ error: 'name required' });
  const row = await prisma.position.update({ where: { id }, data: { name: nm } });
  res.json(row);
});

// --- Delete position (only if unused)
router.delete('/positions/:pid', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.pid);
  const usedInInfo = await prisma.internshipInfo.count({ where: { positionId: id } });
  const usedInReq  = await prisma.request.count({ where: { positionId: id } });
  if (usedInInfo > 0 || usedInReq > 0) return res.status(409).json({ error: 'Position is in use' });

  await prisma.position.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
