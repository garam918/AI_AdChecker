import { describe, expect, it } from 'vitest';

import { LocalEnforcementCaseRepository } from './local-enforcement-case-repository';
import { LocalProcessedRegulationLoader } from './local-processed-regulation-loader';
import { LocalRegulationSourceLoader } from './local-regulation-source-loader';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';

describe('General Food official corpus', () => {
  it('keeps processed chunks reproducible from the structured source corpus', async () => {
    const raw = await new LocalRegulationSourceLoader('GENERAL_FOOD').load();
    const processed = await new LocalProcessedRegulationLoader(
      'GENERAL_FOOD',
    ).load();
    const parsed = new StructureAwareRegulationParser().parse(raw);

    expect(processed.documents).toEqual(parsed.documents);
    expect(processed.chunks).toEqual(parsed.chunks);
    expect(processed.chunks).toHaveLength(10);
    expect(
      processed.documents.every(
        (document) =>
          document.authority === '식품의약품안전처' &&
          new URL(document.sourceUrl).hostname === 'www.law.go.kr',
      ),
    ).toBe(true);
    expect(
      processed.chunks.every(
        (chunk) =>
          chunk.metadata.pack === 'GENERAL_FOOD' && Boolean(chunk.article),
      ),
    ).toBe(true);
  });

  it('stores enforcement examples separately from regulatory citations', async () => {
    const cases = await new LocalEnforcementCaseRepository().findRelevantCases(
      'GENERAL_FOOD',
      'DISEASE_PREVENTION_TREATMENT',
    );

    expect(cases.length).toBeGreaterThan(0);
    expect(
      cases.every(
        (item) =>
          item.authority === '식품의약품안전처' &&
          new URL(item.sourceUrl).hostname === 'www.mfds.go.kr',
      ),
    ).toBe(true);
  });
});
