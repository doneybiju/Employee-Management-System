// backend/src/routes/email.ts
import { Router, Request, Response } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import { sendMail } from '../lib/mailer';
import {
  ensureEmailTheme,
  updateEmailTheme,
  listEmailTemplates,
  getEmailTemplateForEdit,
  upsertEmailTemplate,
  resetEmailTemplateToDefault,
  renderEmailPreview,
} from '../lib/emailTemplates';

const router = Router();

// super_admin only
router.use(ensureAuthenticated as any, ...authorize('super_admin'));

router.get('/theme', async (_req: Request, res: Response) => {
  const theme = await ensureEmailTheme();
  res.json(theme);
});

router.put('/theme', async (req: Request, res: Response) => {
  const userId = Number((req as any).user?.id || 0) || undefined;
  const theme = await updateEmailTheme(req.body ?? {}, userId);
  res.json(theme);
});

router.get('/templates', async (_req: Request, res: Response) => {
  res.json(await listEmailTemplates());
});

router.get('/templates/:key', async (req: Request, res: Response) => {
  try {
    res.json(await getEmailTemplateForEdit(String(req.params.key)));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'invalid_template_key' });
  }
});

router.put('/templates/:key', async (req: Request, res: Response) => {
  try {
    const userId = Number((req as any).user?.id || 0) || undefined;
    const row = await upsertEmailTemplate(String(req.params.key), req.body ?? {}, userId);
    res.json({ ok: true, row });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'save_failed' });
  }
});

router.delete('/templates/:key', async (req: Request, res: Response) => {
  try {
    await resetEmailTemplateToDefault(String(req.params.key));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'reset_failed' });
  }
});

router.post('/templates/:key/preview', async (req: Request, res: Response) => {
  try {
    const out = await renderEmailPreview(String(req.params.key), req.body?.data);
    res.json(out);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'preview_failed' });
  }
});

router.post('/templates/:key/test-send', async (req: Request, res: Response) => {
  try {
    const to = String(req.body?.to || '').trim();
    if (!to) return res.status(400).json({ error: 'to_required' });

    const out = await renderEmailPreview(String(req.params.key), req.body?.data);

    await sendMail({
      to,
      subject: out.subject,
      html: out.html,
      text: out.text,
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'send_failed' });
  }
});

export default router;
