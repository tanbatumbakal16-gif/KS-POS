ALTER TABLE "StockMovement"
ADD COLUMN "branchId" TEXT;

UPDATE "StockMovement" AS movement
SET "branchId" = sale."branchId"
FROM "Sale" AS sale
WHERE movement."branchId" IS NULL
  AND movement."type" = 'SALE'
  AND movement."note" = 'Sale ' || sale."receiptNumber" || ' - Branch ' || sale."branchId";

CREATE INDEX "StockMovement_branchId_productId_createdAt_idx"
ON "StockMovement"("branchId", "productId", "createdAt");

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
