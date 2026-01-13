// frontend/src/lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""; // e.g. "http://localhost:4000"

function normalize(path: string): string {
  if (!path) return `${API_BASE || ""}/api`;
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/api/")
    ? path
    : path.startsWith("api/")
      ? `/${path}`
      : `/api${path.startsWith("/") ? path : `/${path}`}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/** Always attaches token; auto-handles JSON vs FormData */
export async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const url = normalize(path);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  // Detect FormData
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  // If NOT FormData and body is a plain object, JSON-encode it
  if (!isFormData && init.body && typeof init.body !== "string" && !(init.body instanceof Blob)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    init = { ...init, body: JSON.stringify(init.body) };
  }

  // DO NOT set Content-Type for FormData — the browser will add the boundary
  if (isFormData && headers.has("Content-Type")) headers.delete("Content-Type");

  return fetch(url, { credentials: "include", ...init, headers });
}

export async function getJson<T = unknown>(path: string): Promise<T> {
  const res = await fetchWithAuth(path);
  if (!res.ok) throw new Error(await safeErr(res) || res.statusText);
  return res.json() as Promise<T>;
}

export async function postJson<T = unknown>(path: string, body?: any): Promise<T> {
  const res = await fetchWithAuth(path, { method: "POST", body });
  if (!res.ok) throw new Error(await safeErr(res) || res.statusText);
  return res.json() as Promise<T>;
}



async function safeErr(res: Response) {
  try { const j = await res.clone().json(); return (j as any)?.error as string | undefined; }
  catch { return undefined; }
}


export async function blockUser(userId: number) {
  const r = await fetchWithAuth(`/api/users/${userId}/block`, { method: 'PATCH' });
  if (!r.ok) throw new Error('block_failed');
  return r.json();
}

export async function unblockUser(userId: number) {
  const r = await fetchWithAuth(`/api/users/${userId}/unblock`, { method: 'PATCH' });
  if (!r.ok) throw new Error('unblock_failed');
  return r.json();
}

// ================= CSV Employee Import =================

export type ImportField = {
  id: string;
  label: string;
  required: boolean;
};

export type ImportPreviewResponse = {
  fileName: string;
  rowCount: number;
  columnCount: number;
  header: string[];
  rows: string[][];
  fields: ImportField[];
};

export type SetupEmailResult = { userId: number; email: string; ok: boolean; error?: string };

export type ImportCommitResult = {
  total: number;
  createdUsers: number;
  createdInterns: number;
  createdInternships: number;
  skippedExisting: number;
  skippedEmpty: number;
  rowErrors: { row: number; error: string }[];

  setupEmailsSent?: number;
  setupEmailsFailed?: number;
  setupEmails?: SetupEmailResult[];
};


export async function resendImportSetupLinks(userIds: number[]) {
  const res = await fetchWithAuth('/api/admin/import/resend-setup-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });

  if (!res.ok) throw new Error((await safeErr(res)) || res.statusText);
  return res.json() as Promise<{ ok: true; count: number; results: SetupEmailResult[] }>;
}


/** Upload CSV and get header + sample rows for mapping */
export async function uploadImportPreview(file: File): Promise<ImportPreviewResponse> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetchWithAuth('/api/admin/import/preview', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error((await safeErr(res)) || res.statusText);
  return res.json() as Promise<ImportPreviewResponse>;
}

/** Send mapping + CSV again to create users */
export async function commitEmployeeImport(
  file: File,
  mapping: Record<string, number | null>,
  options?: { companyEmailMode?: 'csv' | 'generate' }
): Promise<ImportCommitResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('mapping', JSON.stringify(mapping));
  form.append('companyEmailMode', options?.companyEmailMode || 'csv'); 

  const res = await fetchWithAuth('/api/admin/import/commit', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error((await safeErr(res)) || res.statusText);
  return res.json() as Promise<ImportCommitResult>;
}

