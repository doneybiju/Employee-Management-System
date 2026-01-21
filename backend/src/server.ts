// backend/src/server.ts
import 'dotenv/config';
import cron from 'node-cron';
import app from './app';
import { refreshEmployeeStatuses } from './lib/status';
import * as deprovision from './lib/deprovision';
import fetch from 'node-fetch';


const PORT = Number(process.env.PORT || 4000);

function scheduleDailyJobs() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 5, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    void runDaily();
    setInterval(() => void runDaily(), 24 * 60 * 60 * 1000);
  }, delay);
}

async function runDaily() {
  try {
    console.log('Daily: refreshing employee statuses…');
    const res = await refreshEmployeeStatuses();
    console.log(res);
  } catch (e) {
    console.error('Daily jobs failed:', e);
  }
}

app.listen(PORT, async () => {
  console.log(`API listening on http://localhost:${PORT}`);

  try {
    console.log('Boot: refreshing employee statuses…');
    const res = await refreshEmployeeStatuses();
    console.log(res);
  } catch (e) {
    console.error('Boot jobs failed:', e);
  }

  scheduleDailyJobs();

  // Deprovision cron (policy-driven) via token-protected route
const deprovExpr = process.env.DEPROV_CRON || '15 0 * * *';    //0 20
cron.schedule(deprovExpr, async () => {
  try {
    await fetch(`${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/deprovision/cron-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_TOKEN || ''}` },
    });
    console.log('[deprovision-cron] kicked');
  } catch (e) {
    console.error('[deprovision-cron] failed:', e);
  }
});
console.log('Deprovision cron scheduled:', deprovExpr);


  // Document reminders cron (policy-driven) via token-protected route
  const remindersExpr = process.env.REMINDERS_CRON || '0 9 * * *';
  cron.schedule(remindersExpr, async () => {
    try {
      await fetch(`${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/reminders/cron-run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_TOKEN || ''}`, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('[reminders-cron] failed:', e);
    }
  });
  console.log('Reminders cron scheduled:', remindersExpr);

  // Document deletion cron (policy-driven; honors whitelist) via token-protected route
  const docCleanupExpr = process.env.DOC_CLEANUP_CRON || '30 0 * * *';
  cron.schedule(docCleanupExpr, async () => {
    try {
      await fetch(`${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/deprovision/doc-cleanup/cron-run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_TOKEN || ''}` },
      });
    } catch (e) {
      console.error('[doc-cleanup-cron] failed:', e);
    }
  });
  console.log('Doc cleanup cron scheduled:', docCleanupExpr);

  });

