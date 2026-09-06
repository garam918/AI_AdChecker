import processedCorpus from '@/data/regulations/processed/general-advertising.chunks.json';
import { describe, expect, it } from 'vitest';

import { LocalRegulationSourceLoader } from './local-regulation-source-loader';
import { LocalProcessedRegulationLoader } from './local-processed-regulation-loader';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';

describe('StructureAwareRegulationParser', () => {
  it('preserves article, paragraph, section and official source metadata', async () => {
    const rawCorpus = await new LocalRegulationSourceLoader().load();
    const parsed = new StructureAwareRegulationParser().parse(rawCorpus);
    const articleChunk = parsed.chunks.find((chunk) =>
      chunk.id.endsWith('article-5-paragraph-1'),
    );
    const guidelineChunk = parsed.chunks.find((chunk) =>
      chunk.id.endsWith('section-3-general-principles'),
    );

    expect(parsed.documents).toHaveLength(4);
    expect(parsed.chunks).toHaveLength(6);
    expect(articleChunk).toMatchObject({
      article: '제5조',
      paragraph: '제1항',
      metadata: { sourceType: 'LAW', pack: 'GENERAL_ADVERTISING' },
    });
    expect(guidelineChunk).toMatchObject({
      article: null,
      section: 'Ⅲ. 일반원칙',
      metadata: { authority: '공정거래위원회' },
    });
  });

  it('keeps the checked-in processed chunk snapshot aligned with parser ids', async () => {
    const rawCorpus = await new LocalRegulationSourceLoader().load();
    const parsed = new StructureAwareRegulationParser().parse(rawCorpus);

    expect(processedCorpus.chunks.map((chunk) => chunk.id).sort()).toEqual(
      parsed.chunks.map((chunk) => chunk.id).sort(),
    );
    const runtimeCorpus = await new LocalProcessedRegulationLoader().load();
    expect(
      runtimeCorpus.chunks.map(({ id, article, paragraph, section, text }) => ({
        id,
        article,
        paragraph,
        section,
        text,
      })),
    ).toEqual(
      parsed.chunks.map(({ id, article, paragraph, section, text }) => ({
        id,
        article,
        paragraph,
        section,
        text,
      })),
    );
  });
});
