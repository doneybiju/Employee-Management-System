// backend/src/google/admin.ts
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getSystemConfig } from '../lib/systemConfig';



const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.group.member',
   'https://www.googleapis.com/auth/drive',
];

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

type CreateUserArgs = {
  primaryEmail: string;
  givenName: string;
  familyName: string;
  password?: string;
  orgUnitPath?: string;
  changePasswordAtNextLogin?: boolean;
};

type AddToGroupArgs = { groupEmail: string; memberEmail: string };

function loadSAKey() {
  const keyPath = process.env.GOOGLE_CREDENTIALS_PATH;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }
  if (!keyPath) throw new Error('GOOGLE_CREDENTIALS_PATH or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY must be set');
  const abs = path.resolve(keyPath);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return {
    client_email: raw.client_email,
    private_key: String(raw.private_key || '').replace(/\\n/g, '\n'),
  };
}

export async function getAuth() {
  // reuse existing JWT within the same process
  if (cachedAuth) {
    return cachedAuth;
  }

  const { client_email, private_key } = loadSAKey();

  // Load subject from SystemConfig first, then fall back to env
  const sys = await getSystemConfig();
  const subject =
    sys.googleAdminSubject ||
    process.env.GOOGLE_ADMIN_SUBJECT ||
    process.env.GOOGLE_ADMIN_EMAIL || // optional extra fallback
    '';

  if (!subject) {
    throw new Error(
      'No Google admin subject configured. Set it in SystemConfig.googleAdminSubject or env GOOGLE_ADMIN_SUBJECT.',
    );
  }

  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES,
    subject,
  });

  cachedAuth = auth;
  return auth;
}


export async function getDirectory() {
  const auth = await getAuth();
  await auth.authorize();
  return google.admin({ version: 'directory_v1', auth });
}

export async function getUserIfExists(userKey: string) {
  const admin = await getDirectory();
  try {
    const { data } = await admin.users.get({ userKey });
    return data;
  } catch (e: any) {
    if (e?.code === 404) return null;
    throw e;
  }
}

export async function ensureUser(args: CreateUserArgs) {
  const admin = await getDirectory();

  const existing = await getUserIfExists(args.primaryEmail);
  if (existing) return { created: false, user: existing };

  const requestBody: any = {
    primaryEmail: args.primaryEmail,
    name: { givenName: args.givenName, familyName: args.familyName },
    password: args.password || Math.random().toString(36).slice(2) + '!Q9',
    changePasswordAtNextLogin: args.changePasswordAtNextLogin ?? true,
  };
  if (args.orgUnitPath) requestBody.orgUnitPath = args.orgUnitPath;

  const { data } = await admin.users.insert({ requestBody });
  return { created: true, user: data };
}

export async function addMemberToGroup({ groupEmail, memberEmail }: AddToGroupArgs) {
  const admin = await getDirectory();
  try {
    await admin.members.insert({
      groupKey: groupEmail,
      requestBody: { email: memberEmail, role: 'MEMBER' },
    });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 409) return { ok: true, already: true };
    throw e;
  }
}

export async function deleteUser(userKey: string) {
  const admin = await getDirectory();
  try {
    await admin.users.delete({ userKey });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 404) return { ok: true, missing: true };
    throw e;
  }
}

export async function suspendUserByEmail(userKey: string): Promise<boolean> {
  const admin = await getDirectory();
  await admin.users.update({ userKey, requestBody: { suspended: true } });
  return true;
}

export async function unsuspendUserByEmail(userKey: string): Promise<boolean> {
  const admin = await getDirectory();
  await admin.users.update({ userKey, requestBody: { suspended: false } });
  return true;
}
