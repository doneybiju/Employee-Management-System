# Agent Context & Rules

## Project Overview
- **Tech Stack:** Node.js, Express (Backend), Next.js (Frontend), Prisma ORM, PostgreSQL.
- **Language:** TypeScript.
- **Package Manager:** Yarn.

## Folder Structure
- `backend/src`: API routes, controllers, and services.
- `backend/prisma`: Database schema and migrations.
- `frontend/src`: Next.js React frontend.
- `frontend/src/lib/api.ts`: Centralized API calls.

## Preferences & Rules
1.  **Functional Style:** Prefer pure functions. Avoid classes unless necessary.
2.  **Code Size:** Keep files under 200 lines. Refactor if they get larger.
3.  **Strict Typing:** No `any`. Always define interfaces for API responses.
4.  **No New Packages:** Do not install new libraries without asking. Use what is in `package.json`.
5.  **Role-Based Access:** All backend routes must check for `req.user.role`.

## Testing Strategy
- **Current State:** No automated testing framework (Jest/Playwright) is currently installed.
- **Verification:** Changes must be verified manually or via custom scripts (e.g., using `ts-node`).
- **Database:** Do NOT mock the database. Use the development database or a test container if available.
- **Frontend:** Verify UI changes by running the dev server (`yarn dev` in `frontend`).

## Security Guidelines
- Never log sensitive data (PII, passwords).
- Always use `process.env` for secrets.
- Ensure all API endpoints validate input.
