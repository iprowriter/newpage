-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'processing', 'ready', 'failed', 'delete_failed');

-- CreateEnum
CREATE TYPE "QueryOutcome" AS ENUM ('answered', 'refused', 'error');

-- CreateEnum
CREATE TYPE "EvalKind" AS ENUM ('answerable', 'out_of_collection', 'out_of_corpus', 'false_premise', 'unstated', 'off_domain');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "chunkTokens" INTEGER NOT NULL DEFAULT 350,
    "topK" INTEGER NOT NULL DEFAULT 6,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "starterQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "page" INTEGER,
    "headingPath" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayText" TEXT NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryTrace" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "outcome" "QueryOutcome" NOT NULL,
    "refusalReason" TEXT,
    "rewriteFired" BOOLEAN NOT NULL DEFAULT false,
    "rewrittenAs" TEXT,
    "gradeScore" DOUBLE PRECISION,
    "retrieved" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "retrievalMs" INTEGER,
    "generationMs" INTEGER,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "chunkTokens" INTEGER NOT NULL,
    "topK" INTEGER NOT NULL,
    "hybrid" BOOLEAN NOT NULL DEFAULT false,
    "recallAtK" DOUBLE PRECISION,
    "mrr" DOUBLE PRECISION,
    "groundedness" DOUBLE PRECISION,
    "citationAccuracy" DOUBLE PRECISION,
    "refusalRate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "kind" "EvalKind" NOT NULL,
    "collectionName" TEXT NOT NULL,
    "expectedChunkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retrievedChunkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank" INTEGER,
    "refused" BOOLEAN NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answer" TEXT,
    "judgeScore" DOUBLE PRECISION,
    "judgeNotes" TEXT,
    "latencyMs" INTEGER,

    CONSTRAINT "EvalResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "Collection"("name");

-- CreateIndex
CREATE INDEX "Document_collectionId_status_idx" ON "Document"("collectionId", "status");

-- CreateIndex
CREATE INDEX "Chunk_collectionId_idx" ON "Chunk"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Chunk_documentId_chunkIndex_key" ON "Chunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "QueryTrace_collectionId_createdAt_idx" ON "QueryTrace"("collectionId", "createdAt");

-- CreateIndex
CREATE INDEX "EvalResult_runId_kind_idx" ON "EvalResult"("runId", "kind");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryTrace" ADD CONSTRAINT "QueryTrace_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
