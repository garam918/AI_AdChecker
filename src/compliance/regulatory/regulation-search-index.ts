import { z } from 'zod';
import { EmbeddingIdentitySchema, validateVectors } from './embedding-provider';
import {
  RegulationChunkSchema,
  RegulationDocumentSchema,
  type RegulationChunk,
} from './schemas';

export const RegulationSearchIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    corpusHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceFiles: z.array(z.string().min(1)).min(1),
    provenance: z.literal('EXISTING_CURATED_CORPUS'),
    documents: z.array(RegulationDocumentSchema).min(1),
    chunks: z.array(RegulationChunkSchema).min(1),
    embedding: EmbeddingIdentitySchema.nullable(),
    entries: z
      .array(
        z.object({
          chunkId: z.string().min(1),
          contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          embedding: z.array(z.number()).nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((index, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: 'custom', message });
    const documents = new Map(index.documents.map((doc) => [doc.id, doc]));
    const chunks = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
    if (
      documents.size !== index.documents.length ||
      chunks.size !== index.chunks.length ||
      new Set(index.entries.map((entry) => entry.chunkId)).size !==
        index.entries.length
    ) {
      fail('Duplicate document/chunk/entry IDs');
    }
    if (index.entries.length !== chunks.size) fail('Incomplete index');
    for (const chunk of index.chunks) {
      const document = documents.get(chunk.documentId);
      if (
        !document ||
        document.title !== chunk.metadata.documentTitle ||
        document.sourceType !== chunk.metadata.sourceType ||
        document.sourceUrl !== chunk.sourceUrl ||
        document.effectiveDate !== chunk.metadata.effectiveDate ||
        document.authority !== chunk.metadata.authority
      ) {
        fail(`Source metadata mismatch: ${chunk.id}`);
      }
    }
    for (const entry of index.entries) {
      if (!chunks.has(entry.chunkId))
        fail(`Unknown indexed chunk: ${entry.chunkId}`);
      if (index.embedding) {
        try {
          validateVectors([entry.embedding], 1, index.embedding.dimensions);
        } catch {
          fail(`Invalid embedding: ${entry.chunkId}`);
        }
      } else if (entry.embedding !== null) fail('Embedding identity missing');
    }
  });

export type RegulationSearchIndex = z.infer<typeof RegulationSearchIndexSchema>;

export function embeddingText(chunk: RegulationChunk) {
  return [
    chunk.metadata.documentTitle,
    chunk.article,
    chunk.paragraph,
    chunk.section,
    chunk.heading,
    chunk.text,
    chunk.metadata.topics.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function chunkContentHash(chunk: RegulationChunk) {
  // Includes provenance, applicability and text, so a metadata-only amendment is not reused.
  return sha256(JSON.stringify(chunk));
}

export function corpusContentHash(
  index: Pick<RegulationSearchIndex, 'documents' | 'chunks'>,
) {
  return sha256(
    JSON.stringify({ documents: index.documents, chunks: index.chunks }),
  );
}
