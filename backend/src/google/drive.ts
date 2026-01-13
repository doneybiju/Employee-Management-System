// backend/src/google/drive.ts
import fs from 'fs';
import { google } from 'googleapis';
import { Readable } from 'stream';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];


// add near top
const publicViewUrl = (id: string) =>
  `https://drive.google.com/uc?id=${encodeURIComponent(id)}&export=view`;


const SHARED_DRIVE_ID = process.env.GOOGLE_SHARED_DRIVE_ID || '';


function getJwt() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error('missing_google_service_account_env');
  }

  const subject = process.env.GOOGLE_ADMIN_SUBJECT; // keep, but optional

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKeyRaw.replace(/\\n/g, '\n'),
    scopes: DRIVE_SCOPES,
    ...(subject ? { subject } : {}), // <-- only include if set
  });
}


export function getDrive() {
  const auth = getJwt();
  return google.drive({ version: 'v3', auth });
}



// small local client (same creds you use for uploadToDrive)
export function driveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function deleteFromDrive(fileId: string) {
  if (!fileId) return;
  const drive = driveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}





const cache = new Map<string, string>(); // key: driveId:path -> folderId

async function ensureFolderPath(driveId: string, path: string[]): Promise<string> {
  const drive = getDrive();
  let parentId = driveId; // root of shared drive
  for (const segment of path) {
    const key = `${driveId}:${segment}:${parentId}`;
    const cached = cache.get(key);
    if (cached) { parentId = cached; continue; }

    const { data } = await drive.files.list({
      corpora: 'drive',
      driveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      q: `'${parentId}' in parents and name = '${segment.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 1,
    });
    let id = data.files?.[0]?.id;
    if (!id) {
      const created = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: segment,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
          driveId,
        } as any,
        fields: 'id',
      });
      id = created.data.id!;
    }
    cache.set(key, id);
    parentId = id!;
  }
  return parentId;
}

export async function uploadToDrive(args: {
  driveId: string;
  folderPath: string[];
  filename: string;
  mimeType: string;
  body: NodeJS.ReadableStream | Buffer;
}) {
  const drive = getDrive();
  const folderId = await ensureFolderPath(args.driveId, args.folderPath);

  const media = {
    mimeType: args.mimeType || 'application/octet-stream',
    body: (Buffer.isBuffer(args.body) ? Readable.from(args.body) : args.body) as Readable,
  };

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name: args.filename, parents: [folderId] },
    media,
    fields: 'id',
  });

  const fileId = created.data.id!;
  let url: string | undefined;

  // Don't fail the upload if public sharing is blocked by Workspace policy
  try {
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    url = publicViewUrl(fileId);
  } catch (e: any) {
    console.warn('[drive] make-public blocked (continuing):', e?.response?.data || e?.message || e);
  }

  return { fileId, url };
}


export async function makePublic(fileId: string) {
  const drive = getDrive();
  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  // Direct view URL
  const url = `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=view`;
  return url;
}

export async function streamDownload(res: any, fileId: string, filename?: string) {
  const drive = getDrive();
  // Optional: fetch metadata for content-type
  let mime = 'application/octet-stream';
  let name = filename || 'download';
  try {
    const meta = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'name,mimeType' });
    if (meta.data.mimeType) mime = meta.data.mimeType;
    if (meta.data.name) name = meta.data.name;
  } catch {}
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);

  const dl = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  dl.data.on('error', () => res.status(500).end()).pipe(res);
}




/**
 * Delete a file from Google Drive (supports shared drives).
 * Security:
 * - Only accepts plausible Drive IDs.
 * - Verifies the file belongs to the configured shared drive (if set).
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  // basic sanity check for Drive IDs
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return false;

  const drive = getDrive(); // <-- reuse your JWT-based auth

  try {
    // verify it belongs to the configured shared drive (defense-in-depth)
    const { data } = await drive.files.get({
      fileId,
      fields: 'id,driveId,trashed',
      supportsAllDrives: true,
    });
    if (SHARED_DRIVE_ID && data.driveId && data.driveId !== SHARED_DRIVE_ID) {
      console.warn(`[drive] Refusing to delete file not in shared drive: ${fileId}`);
      return false;
    }
  } catch (e) {
    console.warn('[drive] metadata read failed, skipping delete:', e);
    return false;
  }

  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (e: any) {
    // treat 404 as already-gone
    if (e?.code === 404) return true;
    console.warn('[drive] delete failed (ignored):', e);
    return false;
  }
}