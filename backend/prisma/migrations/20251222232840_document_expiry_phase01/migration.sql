-- CreateIndex
CREATE INDEX "intern_docs_type_expiry_idx" ON "public"."intern_documents"("document_type", "expiry_date");
