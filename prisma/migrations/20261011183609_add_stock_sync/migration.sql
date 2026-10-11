-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceStatus" TEXT,
ADD COLUMN     "stockSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StockSyncRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checked" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "inStock" INTEGER NOT NULL DEFAULT 0,
    "outOfStock" INTEGER NOT NULL DEFAULT 0,
    "notFound" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "priceDiffs" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,

    CONSTRAINT "StockSyncRun_pkey" PRIMARY KEY ("id")
);
