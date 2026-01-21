// backend/src/routes/users-mini.ts
import { Router } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import prisma from '../prisma';

const router = Router();

router.get('/', ensureAuthenticated, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, surname: true, companyEmail: true, role: true, empType: true },
    orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
  });
  res.json(users);
});

export default router;
