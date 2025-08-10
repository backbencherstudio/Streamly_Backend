/*
  Warnings:

  - The `genre` column on the `Content` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Genra" AS ENUM ('action', 'adventure', 'animation', 'biography', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy', 'history', 'horror', 'music', 'musical', 'mystery', 'romance', 'sci_fi', 'sport', 'thriller', 'war', 'western');

-- AlterTable
ALTER TABLE "Content" DROP COLUMN "genre",
ADD COLUMN     "genre" "Genra";
