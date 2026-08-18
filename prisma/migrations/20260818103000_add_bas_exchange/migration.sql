-- CreateEnum
CREATE TYPE "BasExchangeStatus" AS ENUM ('NEW', 'SENDING', 'SENT_TO_BAS', 'ERROR');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "basConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "basError" TEXT,
ADD COLUMN     "basSentAt" TIMESTAMP(3),
ADD COLUMN     "basStatus" "BasExchangeStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "deliveryMethod" TEXT,
ADD COLUMN     "orderNumber" SERIAL NOT NULL,
ADD COLUMN     "paymentMethod" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "article" TEXT,
ADD COLUMN     "basId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "basId" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Product_basId_key" ON "Product"("basId");

-- CreateIndex
CREATE UNIQUE INDEX "User_basId_key" ON "User"("basId");

