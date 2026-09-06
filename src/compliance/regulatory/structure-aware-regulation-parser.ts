import type { RegulationParser } from './ingestion';
import {
  RegulationChunkSchema,
  RegulationDocumentSchema,
  type RawRegulationCorpus,
} from './schemas';

export function normalizeRegulationText(text: string) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export class StructureAwareRegulationParser implements RegulationParser {
  parse(corpus: RawRegulationCorpus) {
    const documents = corpus.documents.map((rawDocument) =>
      RegulationDocumentSchema.parse({
        id: rawDocument.id,
        title: rawDocument.title,
        shortTitle: rawDocument.shortTitle,
        authority: rawDocument.authority,
        sourceType: rawDocument.sourceType,
        sourceUrl: rawDocument.sourceUrl,
        effectiveDate: rawDocument.effectiveDate,
        version: rawDocument.version,
        retrievedAt: rawDocument.retrievedAt,
      }),
    );

    const chunks = corpus.documents.flatMap((document) =>
      document.sections.map((section) =>
        RegulationChunkSchema.parse({
          id: `${document.id}:${section.id}`,
          documentId: document.id,
          article: section.article,
          paragraph: section.paragraph,
          section: section.section,
          heading: section.heading,
          text: section.text,
          normalizedText: normalizeRegulationText(
            [
              section.article,
              section.paragraph,
              section.section,
              section.heading,
              section.text,
              ...section.metadata.topics,
            ]
              .filter(Boolean)
              .join(' '),
          ),
          sourceUrl: document.sourceUrl,
          metadata: {
            ...section.metadata,
            pack: document.pack,
            documentTitle: document.title,
            shortTitle: document.shortTitle,
            authority: document.authority,
            sourceType: document.sourceType,
            effectiveDate: document.effectiveDate,
          },
        }),
      ),
    );

    return { documents, chunks };
  }
}
