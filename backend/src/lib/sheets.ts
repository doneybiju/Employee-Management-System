// backend/src/lib/sheets.ts
import { google } from 'googleapis';
import { getSystemConfig } from './systemConfig';

type SheetsClient = {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
};

let cached: { client: SheetsClient; cacheKey: string } | null = null;

/**
 * Build or reuse a Sheets client based on SystemConfig.
 */
async function getClient(): Promise<SheetsClient | null> {
  const cfg = await getSystemConfig();

  const spreadsheetId = cfg.googleSheetsSpreadsheetId || '';
  const clientEmail = cfg.googleSheetsClientEmail || '';
  const privateKeyRaw = cfg.googleSheetsPrivateKey || '';

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const cacheKey = [spreadsheetId, clientEmail, privateKey ? '1' : '0'].join('|');

  if (cached && cached.cacheKey === cacheKey) {
    return cached.client;
  }

  if (!spreadsheetId || !clientEmail || !privateKey) {
    console.warn('SystemConfig: Google Sheets config missing; exports will be skipped.');
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const client: SheetsClient = { sheets, spreadsheetId };

  cached = { client, cacheKey };
  return client;
}

async function ensureHeader(sheetName: string, expectedHeaders: string[]) {
  const client = await getClient();
  if (!client) return;

  const { sheets, spreadsheetId } = client;

  // Read first row
  const getResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });

  const row = (getResp.data.values?.[0] ?? []) as string[];

  // If headers already present (starts with expected sequence), do nothing
  const matches =
    row.length >= expectedHeaders.length &&
    expectedHeaders.every((h, i) => row[i] === h);

  if (matches) return;

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [expectedHeaders] },
  });
}

/**
 * Appends a row after ensuring headers exist once.
 */
export async function appendRowWithHeader(
  sheetName: string,
  headers: string[],
  values: (string | number | null)[]
) {
  const client = await getClient();
  if (!client) return;

  const { sheets, spreadsheetId } = client;

  await ensureHeader(sheetName, headers);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}
