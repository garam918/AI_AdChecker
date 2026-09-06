import { beforeEach, describe, expect, it } from 'vitest';

import type { Claim } from '../core/schemas';
import { InMemoryRegulationRepository } from './in-memory-regulation-repository';
import { LocalRegulationSourceLoader } from './local-regulation-source-loader';
import { RegulatoryQueryBuilder } from './regulatory-query-builder';
import { RegulationIngestionService } from './regulation-ingestion-service';
import { RegulatoryRetriever } from './regulatory-retriever';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';

describe('RegulatoryRetriever', () => {
  const repository = new InMemoryRegulationRepository();
  const retriever = new RegulatoryRetriever(repository);
  const queryBuilder = new RegulatoryQueryBuilder();

  beforeEach(async () => {
    await new RegulationIngestionService(
      new LocalRegulationSourceLoader(),
      new StructureAwareRegulationParser(),
      repository,
    ).ingest();
  });

  it('ranks substantiation sources for objective numerical claims', async () => {
    const claim = createClaim('100% 정확한 AI', 'OBJECTIVE_PERFORMANCE');
    const hits = await retriever.retrieve(queryBuilder.build(claim), {
      pack: 'GENERAL_ADVERTISING',
      maxResults: 3,
      effectiveAt: '2026-09-06',
      minimumScore: 0.08,
    });

    expect(hits).not.toHaveLength(0);
    expect(hits.some((hit) => hit.chunk.metadata.topics.includes('실증'))).toBe(
      true,
    );
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('supports source type and effective date filters', async () => {
    const claim = createClaim('업계 1위', 'SUPERIORITY');
    const hits = await retriever.retrieve(queryBuilder.build(claim), {
      pack: 'GENERAL_ADVERTISING',
      sourceTypes: ['OFFICIAL_GUIDELINE'],
      maxResults: 5,
      effectiveAt: '2020-01-01',
      minimumScore: 0,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].chunk.metadata.sourceType).toBe('OFFICIAL_GUIDELINE');
  });
});

function createClaim(text: string, claimType: Claim['claimType']): Claim {
  return {
    id: 'claim-1',
    scanId: 'scan-1',
    text,
    claimType,
    startOffset: 0,
    endOffset: text.length,
  };
}
