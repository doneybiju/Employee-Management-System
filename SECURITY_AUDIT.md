# Security Audit - Full System Readiness Report (OWASP Top 10)

**Date:** October 26, 2023
**Auditor:** Senior Security Engineer (AI)
**Scope:** Frontend, Backend, API Routes, Database Schema

---

## 🟢 Section A: Strong Security Points

The following features and practices contribute to a robust security posture:

1.  **Authentication & Session Management**:
    *   **Secure Password Storage**: Passwords are hashed using `bcrypt` before storage (`backend/src/routes/auth.ts`).
    *   **Session Handling**: Uses `httpOnly` cookies with `SameSite=Lax` (and `Secure` in production) to prevent XSS-based token theft.
    *   **Rate Limiting**: Login endpoints implement `express-rate-limit` (3 attempts per 15 minutes) to mitigate brute-force attacks (`backend/src/routes/auth.ts`).

2.  **Authorization (RBAC)**:
    *   **Middleware Enforcement**: The `authorize` middleware (`backend/src/middleware/authorize.ts`) is consistently applied to sensitive routes (e.g., `requests.ts`, `admin.ts`), ensuring only `hr` or `super_admin` can access administrative functions.
    *   **Role Validation**: Routes explicitly check `req.user.role` before granting access.

3.  **Data Isolation (Broken Access Control Defense)**:
    *   **Intern Restriction**: Standard users (Interns) are restricted to their own data.
        *   `GET /api/requests/me` returns only the user's requests.
        *   `GET /api/projects` filters projects to those the user is a member of or created.
        *   Interns cannot list all users or view detailed profiles of others.
    *   **Context-Aware Logic**: `backend/src/routes/requests.ts` uses `req.user.id` from the trusted JWT payload to identify the requester, preventing IDOR (Insecure Direct Object Reference) where a user could submit requests for others by manipulating `userId` in the body.

4.  **File Handling**:
    *   **Validation**: File uploads (`backend/src/routes/uploads.ts`) are validated by both MIME type and "magic bytes" (e.g., checking for `%PDF-` header), preventing malicious file uploads masquerading as PDFs.
    *   **Storage**: Files are offloaded to Google Drive rather than stored on the local server, mitigating local Remote Code Execution (RCE) risks.
    *   **Quota**: A 15MB file size limit is enforced.

5.  **Logging & Monitoring**:
    *   **Comprehensive Logging**: The system logs critical actions including failed logins (`LoginEvent` with reason/IP/UA) and document operations (`DocumentLog`), which is essential for audit trails and incident response.

---

## 🔴 Section B: Critical Vulnerabilities (Must Fix)

The following issues pose a significant risk and should be addressed before public release:

1.  **CSV Injection (Formula Injection)**
    *   **Vulnerability**: The system exports data to Google Sheets (e.g., approved requests in `backend/src/routes/requests.ts`) using `backend/src/lib/sheets.ts`. The sheets utility uses `valueInputOption: 'USER_ENTERED'`, which causes Google Sheets to interpret cell values starting with `=`, `+`, `-`, or `@` as formulas.
    *   **Scenario**: A malicious user could submit a request with a "Reason" or "Comment" containing a payload like `=cmd|' /C calc'!A0` (or Google Sheets equivalent). When an HR user opens the sheet, this formula executes.
    *   **Remediation**: In `backend/src/lib/sheets.ts`, sanitize inputs by prepending a single quote `'` to any value starting with the dangerous characters (`=`, `+`, `-`, `@`) before sending to Google Sheets. Alternatively, use `valueInputOption: 'RAW'` if formula parsing is not strictly required.
    *   **Secondary Vector**: The "Import Users" feature (`backend/src/routes/admin.ts`) reads CSVs but does not sanitize them before saving to the database. If this data (e.g., a user's name) is ever re-exported to a spreadsheet, the injection vulnerability persists.

---

## 🟡 Section C: Weaknesses & Improvements (Recommended)

These items are not immediate blockers but represent technical debt or areas for future hardening:

1.  **Project Task Permissions**:
    *   **Observation**: In `backend/src/routes/projects.ts`, the `canTouchTask` helper allows *any* project member to modify *any* task in the project (via `PATCH /tasks/:taskId`).
    *   **Risk**: While this prevents unauthorized access from *outside* the project, it allows internal mischief (e.g., an intern reassigning a manager's task).
    *   **Recommendation**: Refine permissions to allow only the Assignee, Team Lead, or Admin to edit specific task details.

2.  **Input Validation Strategy**:
    *   **Observation**: Validation is currently manual (e.g., `if (!title) ...`).
    *   **Recommendation**: Adopt a schema validation library like **Zod** or **Joi**. This ensures consistent type checking, string sanitization (trimming), and length limits across all API endpoints, reducing the attack surface for edge-case payloads.

3.  **SSRF Defense-in-Depth**:
    *   **Observation**: The `streamDownload` function (`backend/src/routes/uploads.ts`) accepts a `fileId` from the URL and passes it to the Google Drive API. While the Google SDK likely handles validation, explicit validation is safer.
    *   **Recommendation**: Add a regex check (e.g., `/^[a-zA-Z0-9_-]{10,}$/`) for `fileId` in the `streamDownload` route before calling the Google API to prevent any potential malformed input from reaching the upstream service.

4.  **Security Headers**:
    *   **Observation**: `helmet` is used, which is good.
    *   **Recommendation**: Ensure Content Security Policy (CSP) is configured in `helmet` to restrict sources of scripts and images, protecting against XSS if a vulnerability is introduced in the frontend.

---

## 🏁 Section D: The Verdict

**Status:** **GO WITH CAVEATS**

**Summary:**
The system demonstrates a strong security posture regarding core Authentication and Access Control, with Interns effectively isolated from sensitive data. However, the **CSV Injection vulnerability** in the reporting/export feature is a critical issue that must be patched to protect administrative users from potential client-side exploits when viewing generated reports.
