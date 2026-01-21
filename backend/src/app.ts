// backend/src/app.ts
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import morgan from 'morgan';
import path from 'path';
import { getPolicyDb, runGoogleThenDbOnce } from './lib/deprovision';

import './auth/passport';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import departmentsRouter from './routes/departments';
import deprovisionRouter from './routes/deprovision';
import profileRouter from './routes/profile';
import publicInternsRouter from './routes/public-interns';
import uploadsRouter from './routes/uploads';
import statsRouter from './routes/stats';
import gsuiteRouter from './routes/gsuite';
import adminRouter from './routes/admin';

import ensureAuthenticated from './middleware/ensureAuthenticated';
import forcePasswordChange from './middleware/forcePasswordChange';
import { authorize } from './middleware/authorize';

import remindersRouter from './routes/reminders';
import projectsRouter from './routes/projects';
import usersMini from './routes/users-mini';
import passwordRouter from './routes/password';


import requestsRouter from './routes/requests';

// --- Simple in-process scheduler for auto purge (runs hourly) ---
import fetch from 'node-fetch';

import docCleanupRouter from './routes/doc-cleanup';

import securityRouter from './routes/security';
import emailAdminRouter from './routes/email';
import logsRouter from './routes/logs';


const app = express();
app.use(cookieParser());
app.use(morgan('dev'));

const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: ORIGIN,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(passport.initialize());

const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 50 });
app.use('/api/auth/', authLimiter);

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api/', apiLimiter);

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/api/admin/email', emailAdminRouter);

app.use('/api/deprovision/doc-cleanup', docCleanupRouter);



// public
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/public/interns', publicInternsRouter);
app.use('/api/auth', authRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);

app.use('/api/requests', requestsRouter);
// app.use('/api/gsuite', gsuiteRoutes);

// app.use('/api/reminders', reminders);

app.post('/api/deprovision/cron-run', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const pol = await getPolicyDb();
    if (!pol.enabled) return res.status(400).json({ error: 'Deprovision is disabled' });
    const out = await runGoogleThenDbOnce(); // deletes in Google, then DB
    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'deprovision failed' });
  }
});



// protected
app.use('/api/profile', ensureAuthenticated as any, forcePasswordChange as any, profileRouter);
app.use('/api/users', ensureAuthenticated as any, forcePasswordChange as any, usersRouter);
app.use('/api/departments', ensureAuthenticated as any, forcePasswordChange as any, departmentsRouter);
app.use('/api/deprovision', ensureAuthenticated as any, forcePasswordChange as any, deprovisionRouter);




app.use('/api/projects', projectsRouter);
// app.use('/api/deprovision', deprovisionRouter);

app.use('/api/admin/doc-cleanup', docCleanupRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/users-mini', usersMini);


// app.use('/api/admin', adminRoutes);

app.use('/api/password', passwordRouter);


function startAutoPurgeScheduler(baseUrl: string) {
  // run once on boot (delay a bit so the server is fully up)
  setTimeout(() => {
    fetch(`${baseUrl}/api/reminders/purge/auto-run`, { method: 'POST' }).catch(() => {});
  }, 15_000);

  // run every hour
  setInterval(() => {
    fetch(`${baseUrl}/api/reminders/purge/auto-run`, { method: 'POST' }).catch(() => {});
  }, 60 * 60 * 1000);
}

// If you know your base URL, set it; otherwise fall back to local dev.
const PORT = process.env.PORT || 3001; // adjust if different
const HOST = process.env.HOST || 'http://localhost';
const BASE = process.env.PUBLIC_BASE_URL || `${HOST}:${PORT}`;

startAutoPurgeScheduler(BASE);







app.use('/api/uploads', ensureAuthenticated as any, forcePasswordChange as any, uploadsRouter);

// alias BEFORE gsuite mount
const alias = express.Router();
const forward = () => [
  ensureAuthenticated as any,
  ...authorize('hr','super_admin'),
  (req: any, _res: any, next: any) => { req.url = '/gsuite/provision/auto'; next(); },
];

alias.post('/provision/auto', ...forward());
alias.post('/admin/provision/auto', ...forward());

app.use('/api', alias);

// gsuite after alias
app.use('/api/gsuite', gsuiteRouter);

app.use(
  '/api/admin/security',
  ensureAuthenticated as any,
  forcePasswordChange as any,
  ...authorize('super_admin'),
  securityRouter
);

app.use(
  '/api/logs',
  ensureAuthenticated as any,
  forcePasswordChange as any,
  logsRouter
);



export default app;
