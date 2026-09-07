import { describe, expect, it } from 'vitest';

import { LocalProcessedRegulationLoader } from './local-processed-regulation-loader';

describe('regulated product official corpora', () => {
  it.each([
    ['PHARMACEUTICAL', '약사법', '제68조'],
    ['MEDICAL_DEVICE', '의료기기법', '제24조'],
    ['COSMETIC', '화장품법', '제13조'],
  ] as const)(
    'loads %s with official source metadata',
    async (pack, title, article) => {
      const corpus = await new LocalProcessedRegulationLoader(pack).load();

      expect(
        corpus.documents.some((document) => document.title === title),
      ).toBe(true);
      expect(
        corpus.chunks.some(
          (chunk) =>
            chunk.article === article &&
            chunk.metadata.pack === pack &&
            chunk.sourceUrl.startsWith('https://www.law.go.kr/'),
        ),
      ).toBe(true);
    },
  );
});
