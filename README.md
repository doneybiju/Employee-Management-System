## Prerequisites

- Node.js 20.x and Yarn
- PostgreSQL running and reachable
- GitHub access to private org repo

## Project Structure

```
.
├─ backend/
│  ├─ generated/
│  ├─ node_modules/
│  ├─ prisma/
│  │  ├─ migrations/
│  │  ├─ schema.prisma
│  │  └─ seed.ts
│  ├─ src/
│  │  ├─ auth/
│  │  │  └─ passport.ts
│  │  ├─ cron/
│  │  │  └─ billingReminders.ts
│  │  ├─ google/
│  │  │  ├─ admin.ts
│  │  │  ├─ deletion.ts
│  │  │  └─ drive.ts
│  │  ├─ lib/
│  │  │  ├─ billing.ts
│  │  │  ├─ deprovision.ts
│  │  │  ├─ mailer.ts
│  │  │  ├─ sheets.ts
│  │  │  └─ status.ts
│  │  ├─ middleware/
│  │  │  ├─ authorize.ts
│  │  │  ├─ cronAuth.ts
│  │  │  ├─ ensureAuthenticated.ts
│  │  │  └─ forcePasswordChange.ts
│  │  ├─ prisma/
│  │  │  └─ client.ts
│  │  ├─ routes/
│  │  │  ├─ admin.ts
│  │  │  ├─ auth.ts
│  │  │  ├─ avatar.ts
│  │  │  ├─ departments.ts
│  │  │  ├─ deprovision.ts
│  │  │  ├─ doc-cleanup.ts
│  │  │  ├─ gsuite.ts
│  │  │  ├─ index.ts
│  │  │  ├─ interns.ts
│  │  │  ├─ password.ts
│  │  │  ├─ profile.ts
│  │  │  ├─ projects.ts
│  │  │  ├─ public-interns.ts
│  │  │  ├─ reminders.ts
│  │  │  ├─ requests.ts
│  │  │  ├─ stats.ts
│  │  │  ├─ uploads.ts
│  │  │  ├─ users.ts
│  │  │  └─ users-mini.ts
│  │  ├─ utils/
│  │  │  └─ jwt.ts
│  │  ├─ app.ts
│  │  ├─ prisma.ts
│  │  └─ server.ts
│  ├─ .env
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ tsconfig.json
│  └─ yarn.lock
│
├─ frontend/
│  ├─ .next/
│  ├─ node_modules/
│  ├─ public/
│  │  ├─ account.png
│  │  └─ images.png
│  ├─ src/
│  │  ├─ components/
│  │  │  ├─ ui/
│  │  │  │  ├─ button.tsx
│  │  │  │  └─ input.tsx
│  │  │  ├─ AvatarCropper.tsx
│  │  │  ├─ CountrySelect.tsx
│  │  │  ├─ DocsReminderToast.tsx
│  │  │  ├─ EmailGenerator.tsx
│  │  │  ├─ Navigation.tsx
│  │  │  ├─ PrivateRoute.tsx
│  │  │  └─ ProtectedRoute.tsx
│  │  ├─ context/
│  │  │  └─ AuthContext.tsx
│  │  ├─ Lib/
│  │  │  ├─ api.ts
│  │  │  └─ auth.ts
│  │  ├─ pages/
│  │  │  ├─ admin/
│  │  │  │  ├─ deprovision.module.css
│  │  │  │  ├─ deprovision.tsx
│  │  │  │  ├─ document-management.tsx
│  │  │  │  ├─ index.tsx
│  │  │  │  ├─ smtp.module.css
│  │  │  │  └─ smtp.tsx
│  │  │  ├─ api/admin/doc-cleanup/policy.ts
│  │  │  ├─ projects/
│  │  │  │  ├─ [id].module.css
│  │  │  │  ├─ [id].tsx
│  │  │  │  ├─ index.module.css
│  │  │  │  └─ index.tsx
│  │  │  ├─ _app.tsx
│  │  │  ├─ _document.tsx
│  │  │  ├─ change-password.tsx
│  │  │  ├─ create-user-auto.module.css
│  │  │  ├─ create-user-auto.tsx
│  │  │  ├─ departments.tsx
│  │  │  ├─ directory.tsx
│  │  │  ├─ forgot-password.tsx
│  │  │  ├─ housing.tsx
│  │  │  ├─ index.tsx
│  │  │  ├─ login.module.css
│  │  │  ├─ login.tsx
│  │  │  ├─ my-work.module.css
│  │  │  ├─ my-work.tsx
│  │  │  ├─ profile.tsx
│  │  │  ├─ requests.tsx
│  │  │  ├─ requests-review.tsx
│  │  │  └─ unauthorized.tsx
│  │  ├─ styles/
│  │  │  ├─ globals.css
│  │  │  └─ profile.css
│  ├─ .env.local
│  ├─ next.config.js
│  ├─ next-env.d.ts
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ tsconfig.json
│  └─ yarn.lock
│
└─ Keys/
   ├─ brave-airship-470008-k8-7b8647b7b553.json
   └─ Sheet-brave-airship-470008-k8-8ff911dff3b1.json

```

## Environment

Copy examples and fill values:
cp backend/.env.example to backend/.env
cp frontend/.env.example to frontend/.env

SMTP Setting are in Stored in the database

## Install

### Backend

```bash
cd backend
yarn install
yarn prisma generate
# First time DB setup:
yarn prisma migrate dev --name init
# Optional: seed if provided
# yarn prisma db seed
yarn dev
# API at http://localhost:8080
# Swagger at http://localhost:8080/api-docs (if enabled)
```

### Frontend

```bash
cd frontend
yarn install
yarn dev
# App at http://localhost:3000
```

### Development workflow

```
Run PostgreSQL.

Backend: install, migrate, yarn dev.

Frontend: install, yarn dev.

Open http://localhost:3000.
```

# Prisma: init, deploy, and manual SQL (views / enum / FK fixes)

## 0) Prereqs

- Set `DATABASE_URL` in `backend/.env`.
- `schema.prisma` has:

  ```prisma
  generator client {
    provider = "prisma-client-js"
    previewFeatures = ["views"]
  }
  ```

- Migrations live in `backend/prisma/migrations/` and are committed.

## 1) Fresh **local** setup

```bash
cd backend
npm i
npx prisma generate
# Creates DB and runs all migrations in prisma/migrations
npx prisma migrate dev
```

## 2) Fresh **production** (or CI) setup

> Never use `migrate dev` on prod.

```bash
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
```

---

## 3) Allocations View – add it and keep Prisma in sync

Prisma can **read** views but won’t create them. We ship a manual SQL migration.

### (A) Preferred: create an empty migration and edit its SQL

```bash
# local only
npx prisma migrate dev --create-only --name add_allocations_view
# then edit:
# backend/prisma/migrations/<timestamp>_add_allocations_view/migration.sql
```

**Replace file contents with (idempotent):**

```sql
-- View needed by schema.prisma: view AllocationsView @@map("allocations_view")
DROP VIEW IF EXISTS public.allocations_view;
CREATE VIEW public.allocations_view AS
SELECT
  a.id,
  a.intern_id,
  i.name AS intern_name,
  a.start_date,
  a.end_date,
  r.id  AS room_id,
  r.room_number,
  r.single,
  r.shared,
  r.price,
  ap.id AS apartment_id,
  ap.apartment_name
FROM allocations a
JOIN intern_details i ON i.intern_id = a.intern_id
JOIN rooms r          ON r.id = a.room_id
JOIN apartments ap    ON ap.id = r.apartment_id;
```

**Apply & generate:**

```bash
npx prisma migrate dev
npx prisma generate
```

### (B) Quick one-off (not recommended for shared envs)

```bash
npx prisma db execute --stdin <<'SQL'
CREATE OR REPLACE VIEW public.allocations_view AS
SELECT
  a.id,
  a.intern_id,
  i.name AS intern_name,
  a.start_date,
  a.end_date,
  r.id  AS room_id,
  r.room_number,
  r.single,
  r.shared,
  r.price,
  ap.id AS apartment_id,
  ap.apartment_name
FROM allocations a
JOIN intern_details i ON i.intern_id = a.intern_id
JOIN rooms r          ON r.id = a.room_id
JOIN apartments ap    ON ap.id = r.apartment_id;
SQL
npx prisma generate
```

### Verify

```bash
psql "$DATABASE_URL" -c "\d+ public.allocations_view"
psql "$DATABASE_URL" -c "SELECT * FROM public.allocations_view LIMIT 5;"
```

### Model (already in `schema.prisma`)

```prisma
view AllocationsView {
  id            Int
  internId      String    @map("intern_id") @db.Uuid
  internName    String    @map("intern_name")
  startDate     DateTime? @map("start_date") @db.Date
  endDate       DateTime? @map("end_date")  @db.Date
  roomId        Int       @map("room_id")
  roomNumber    String    @map("room_number") @db.VarChar(10)
  single        Boolean
  shared        Boolean
  price         Int?
  apartmentId   Int       @map("apartment_id")
  apartmentName String    @map("apartment_name")

  @@unique([id])
  @@map("allocations_view")
}
```

### Use it

```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = await prisma.allocationsView.findMany({
  orderBy: { id: "asc" },
  take: 20,
});
console.log(rows);
```

---

## 4) If you edited a migration that already ran locally

Reset **local** DB (never prod):

```bash
npx prisma migrate reset --force
npx prisma migrate dev
```

---

## 5) Deploying to prod

Commit the migration folder, then on prod/CI:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 6) Gotchas

- Don’t edit migrations already applied on prod; add a **new** migration.
- Views can’t have `@id`; use `@@unique([id])` (as shown).
- Ensure the **view migration** exists and runs before code that queries the view.
- After any schema change:

  ```bash
  npx prisma generate
  ```
