-- CreateTable
CREATE TABLE "public"."email_theme" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "brand_color" TEXT NOT NULL DEFAULT '#4a6cf7',
    "header_title" TEXT,
    "logo_url" TEXT,
    "button_color" TEXT,
    "footer_text" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "email_theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_templates" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "subject_template" VARCHAR(255) NOT NULL,
    "html_template" TEXT NOT NULL,
    "text_template" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "variables" JSONB,
    "sample_data" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "public"."email_templates"("key");
