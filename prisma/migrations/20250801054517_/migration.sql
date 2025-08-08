-- CreateTable
CREATE TABLE "temp" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_verified" INTEGER DEFAULT 0,

    CONSTRAINT "temp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temp_email_key" ON "temp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "temp_otp_key" ON "temp"("otp");
