import { beforeEach, describe, expect, it } from 'vitest';

import { CitationValidator } from './citation-validator';
import { InMemoryRegulationRepository } from './in-memory-regulation-repository';
import { LocalRegulationSourceLoader } from './local-regulation-source-loader';
import { RegulationIngestionService } from './regulation-ingestion-service';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';

describe('CitationValidator', () => {
  const repository = new InMemoryRegulationRepository();
  const validator = new CitationValidator(repository);
  const validChunkId =
    'fair-labeling-advertising-act-2025:article-5-paragraph-1';

  beforeEach(async () => {
    await new RegulationIngestionService(
      new LocalRegulationSourceLoader(),
      new StructureAwareRegulationParser(),
      repository,
    ).ingest();
  });

  it('rejects an unknown source chunk id', async () => {
    const result = await validator.validate([
      { chunkId: 'invented:article-999', article: '제999조' },
    ]);

    expect(result.verified).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('CHUNK_NOT_FOUND');
  });

  it('rejects an article assertion that differs from stored metadata', async () => {
    const result = await validator.validate([
      { chunkId: validChunkId, article: '제9조' },
    ]);

    expect(result.verified).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('ARTICLE_MISMATCH');
  });

  it('resolves a valid citation from repository-owned metadata', async () => {
    const result = await validator.validate([
      { chunkId: validChunkId, article: '제5조' },
    ]);

    expect(result.rejected).toHaveLength(0);
    expect(result.verified[0]).toMatchObject({
      chunk: { id: validChunkId, article: '제5조' },
      document: { title: '표시·광고의 공정화에 관한 법률' },
    });
  });
});
