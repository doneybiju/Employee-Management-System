import { Router } from 'express';
const router = Router();

// This file used incompatible schema logic (wide table).
// Replaced with dummy to allow compilation.
// Use /api/profile/avatar or /api/profile/documents logic instead.

router.post('/avatar', (req, res) => res.status(500).json({ error: 'Endpoint deprecated/broken. Please use /api/profile endpoints.' }));
router.post('/documents/:kind', (req, res) => res.status(500).json({ error: 'Endpoint deprecated/broken. Please use /api/profile endpoints.' }));

export default router;
