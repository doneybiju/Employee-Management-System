// backend/src/lib/systemConfig.ts
import prisma from '../prisma';

export type SystemConfigValue = {
  companyEmailDomain: string;
  googleWorkspaceDomain: string;
  googleAdminSubject: string | null;
  googleSharedDriveId: string | null;
  googleAllGroup: string | null;

  googleSheetsSpreadsheetId: string | null;
  googleSheetsClientEmail: string | null;
  googleSheetsPrivateKey: string | null;
  googleSheetsExtraHours: string | null;
  googleSheetsAbsence: string | null;

  maxmindAccountId: string | null;
  maxmindEditionIds: string | null;
  geoipDbDir: string | null;
};

let cache: { value: SystemConfigValue; loadedAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

export async function getSystemConfig(): Promise<SystemConfigValue> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_MS) {
    return cache.value;
  }

  const row = await prisma.systemConfig.findUnique({ where: { id: 1 } });

  const companyEmailDomain =
    row?.companyEmailDomain ||
    process.env.COMPANY_EMAIL_DOMAIN ||
    process.env.GOOGLE_WORKSPACE_DOMAIN ||
    'extramus.eu';

  const googleWorkspaceDomain =
    row?.googleWorkspaceDomain ||
    process.env.GOOGLE_WORKSPACE_DOMAIN ||
    companyEmailDomain;

  const value: SystemConfigValue = {
    companyEmailDomain,
    googleWorkspaceDomain,
    googleAdminSubject: row?.googleAdminSubject || process.env.GOOGLE_ADMIN_SUBJECT || null,
    googleSharedDriveId: row?.googleSharedDriveId || process.env.GOOGLE_SHARED_DRIVE_ID || null,
    googleAllGroup: row?.googleAllGroup || process.env.GOOGLE_ALL_GROUP || null,

    googleSheetsSpreadsheetId:
      row?.googleSheetsSpreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null,
    googleSheetsClientEmail:
      row?.googleSheetsClientEmail || process.env.GOOGLE_SHEETS_CLIENT_EMAIL || null,
    googleSheetsPrivateKey:
      row?.googleSheetsPrivateKey || process.env.GOOGLE_SHEETS_PRIVATE_KEY || null,
    googleSheetsExtraHours:
      row?.googleSheetsExtraHours || process.env.GOOGLE_SHEETS_EXTRA_HOURS_SHEET || null,
    googleSheetsAbsence:
      row?.googleSheetsAbsence || process.env.GOOGLE_SHEETS_ABSENCE_SHEET || null,

    maxmindAccountId: row?.maxmindAccountId || process.env.MAXMIND_ACCOUNT_ID || null,
    maxmindEditionIds: row?.maxmindEditionIds || process.env.MAXMIND_EDITION_IDS || null,
    geoipDbDir: row?.geoipDbDir || process.env.GEOIP_DB_DIR || null,
  };

  cache = { value, loadedAt: now };
  return value;
}

export function invalidateSystemConfigCache() {
  cache = null;
}
