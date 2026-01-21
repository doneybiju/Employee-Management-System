-- CreateTable
CREATE TABLE "public"."system_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_email_domain" TEXT,
    "google_workspace_domain" TEXT,
    "google_admin_subject" TEXT,
    "google_shared_drive_id" TEXT,
    "google_all_group" TEXT,
    "google_sheets_spreadsheet_id" TEXT,
    "google_sheets_client_email" TEXT,
    "google_sheets_extra_hours_sheet" TEXT,
    "google_sheets_absence_sheet" TEXT,
    "maxmind_account_id" TEXT,
    "maxmind_edition_ids" TEXT,
    "geoip_db_dir" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);
