-- CreateTable
CREATE TABLE "ExchangeLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT,
    "mode" TEXT,
    "filename" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 200,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "answer" TEXT NOT NULL DEFAULT '',
    "detail" TEXT,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "agent" TEXT,

    CONSTRAINT "ExchangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeLog_at_idx" ON "ExchangeLog"("at");
