/*
  Warnings:

  - You are about to drop the column `supersededById` on the `attendance_records` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "attendance_records" DROP COLUMN "supersededById",
ADD COLUMN     "correctionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "fromStatus" "AttendanceStatus" NOT NULL,
    "toStatus" "AttendanceStatus" NOT NULL,
    "fromOtHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "toOtHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "correctedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_corrections_tenantId_attendanceId_idx" ON "attendance_corrections"("tenantId", "attendanceId");

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
