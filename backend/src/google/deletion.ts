// backend/src/google/deletion.ts
import fs from 'fs';
import { google } from 'googleapis';
import { getDrive } from './drive'; // ← use the same JWT/impersonated Drive client

const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.datatransfer',
];
const DRIVE_APP_ID = '435070579839';

function getJwt() {
  const keyPath = process.env.GOOGLE_CREDENTIALS_PATH!;
  const subject = process.env.GOOGLE_ADMIN_SUBJECT!;
  const creds = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
    subject,
  });
}

async function getUserIdByEmail(auth: any, email: string): Promise<string> {
  const dir = google.admin({ version: 'directory_v1', auth });
  const { data } = await dir.users.get({ userKey: email });
  if (!data?.id) throw new Error(`User not found or has no id: ${email}`);
  return String(data.id);
}

async function startDriveTransferAll(fromEmail: string, toEmail: string): Promise<string> {
  const auth = getJwt();
  const dt = google.admin({ version: 'datatransfer_v1', auth });

  // Data Transfer API requires immutable user IDs, not emails.
  const oldId = await getUserIdByEmail(auth, fromEmail);
  const newId = await getUserIdByEmail(auth, toEmail);

  const { data } = await dt.transfers.insert({
    requestBody: {
      oldOwnerUserId: oldId,
      newOwnerUserId: newId,
      applicationDataTransfers: [
        {
          applicationId: DRIVE_APP_ID,
          applicationTransferParams: [
            { key: 'PRIVACY_LEVEL', value: ['PRIVATE', 'SHARED'] },
          ],
        },
      ],
    } as any,
  });

  if (!data?.id) throw new Error('Transfer insert returned no id');
  return String(data.id);
}

async function deleteWorkspaceUser(email: string) {
  const auth = getJwt();
  const dir = google.admin({ version: 'directory_v1', auth });
  try {
    await dir.users.delete({ userKey: email });
  } catch (err: any) {
    if (err?.code === 404) return; // already gone
    throw err;
  }
}

export function extractDriveId(input: string): string | null {
  if (!input) return null;
  // matches: /file/d/{id}/... or ?id={id}
  const m1 = input.match(/\/file\/d\/([^/]+)/);
  if (m1) return m1[1];
  const m2 = input.match(/[?&]id=([^&]+)/);
  if (m2) return m2[1];
  // sometimes we persist plain id
  if (/^[A-Za-z0-9_-]{10,}$/.test(input)) return input;
  return null;
}

export async function deleteDriveFileByAny(input: string): Promise<boolean> {
  const id = extractDriveId(input);
  if (!id) return false;
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId: id, supportsAllDrives: true });
    return true;
  } catch (e: any) {
    // treat 404 as already deleted
    if (e?.code === 404) return true;
    console.warn('[deletion] Drive delete failed:', e);
    return false;
  }
}

export async function googleDeleteUser(opts: {
  fromEmail: string;
  transferToEmail?: string | null;
}) {
  const src = opts.fromEmail.trim();
  const dest = opts.transferToEmail?.trim() || null;

  let transferId: string | null = null;
  if (dest) {
    try {
      transferId = await startDriveTransferAll(src, dest);
    } catch (e) {
      console.error('Drive transfer failed for', src, '→', dest, ':', e);
      // continue with deletion
    }
  }

  await deleteWorkspaceUser(src);
  return { ok: true, transferId };
}

export async function getTransferStatus(dataTransferId: string) {
  const auth = getJwt();
  const dt = google.admin({ version: 'datatransfer_v1', auth });
  const { data } = await dt.transfers.get({ dataTransferId });
  return { id: data.id ?? null, status: data.overallTransferStatusCode ?? null };
}
