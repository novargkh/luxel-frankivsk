-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "bafName" TEXT,
ADD COLUMN     "bafSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientPrice" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPrice_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateIndex
CREATE INDEX "ClientPrice_productId_idx" ON "ClientPrice"("productId");

-- AddForeignKey
ALTER TABLE "ClientPrice" ADD CONSTRAINT "ClientPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPrice" ADD CONSTRAINT "ClientPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
