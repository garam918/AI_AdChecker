import { describe, expect, it } from 'vitest';

import { LocalProcessedRegulationLoader } from './local-processed-regulation-loader';

describe('health functional food regulation corpus', () => {
  it('loads official-law chunks for functionality and prior review', async () => {
    const corpus = await new LocalProcessedRegulationLoader(
      'HEALTH_FUNCTIONAL_FOOD',
    ).load();

    expect(corpus.chunks.length).toBeGreaterThanOrEqual(8);
    expect(
      corpus.chunks.some(
        (chunk) =>
          chunk.article === '제8조' &&
          chunk.metadata.topics.includes('거짓 과장'),
      ),
    ).toBe(true);
    expect(
      corpus.chunks.some(
        (chunk) =>
          chunk.article === '제10조' &&
          chunk.metadata.topics.includes('자율심의'),
      ),
    ).toBe(true);
    expect(
      corpus.chunks.every(
        (chunk) => chunk.metadata.pack === 'HEALTH_FUNCTIONAL_FOOD',
      ),
    ).toBe(true);
  });
});
