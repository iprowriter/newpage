-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('collection', 'chat');

-- DropIndex
DROP INDEX "Collection_name_key";

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "kind" "CollectionKind" NOT NULL DEFAULT 'collection';
