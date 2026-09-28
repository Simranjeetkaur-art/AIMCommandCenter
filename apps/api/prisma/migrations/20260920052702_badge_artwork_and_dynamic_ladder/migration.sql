-- AlterTable
ALTER TABLE "badges" ADD COLUMN     "iconSvg" TEXT,
ADD COLUMN     "iconText" TEXT,
ADD COLUMN     "level" INTEGER,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tone" TEXT NOT NULL DEFAULT 'brass';

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "devAccessFlag" TEXT,
ADD COLUMN     "levelLabel" TEXT,
ADD COLUMN     "tagline" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;
