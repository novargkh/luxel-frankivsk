-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "minTotal" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "perClientLimit" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "_PromoCodeProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PromoCodeProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PromoCodeProducts_B_index" ON "_PromoCodeProducts"("B");

-- AddForeignKey
ALTER TABLE "_PromoCodeProducts" ADD CONSTRAINT "_PromoCodeProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromoCodeProducts" ADD CONSTRAINT "_PromoCodeProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
