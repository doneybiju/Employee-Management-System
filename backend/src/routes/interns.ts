// backend/src/routes/interns.ts
import { Router, Request, Response } from 'express';
import { authorize } from '../middleware/authorize';
import { refreshInternStatuses } from '../lib/status';

const router = Router();

router.post(
    '/refresh-status',
    authorize('hr', 'super_admin'),
    async (_req: Request, res: Response) => {
        const out = await refreshInternStatuses();
        res.json(out);
    }
);

export default router;
