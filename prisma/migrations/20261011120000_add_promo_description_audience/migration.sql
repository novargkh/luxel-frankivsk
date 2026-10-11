-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "description" TEXT,
ADD COLUMN     "showToClients" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_PromoCodeClients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PromoCodeClients_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PromoCodeClients_B_index" ON "_PromoCodeClients"("B");

-- AddForeignKey
ALTER TABLE "_PromoCodeClients" ADD CONSTRAINT "_PromoCodeClients_A_fkey" FOREIGN KEY ("A") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromoCodeClients" ADD CONSTRAINT "_PromoCodeClients_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

