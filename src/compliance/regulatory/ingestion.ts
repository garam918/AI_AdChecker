import type {
  RawRegulationCorpus,
  ProcessedRegulationCorpus,
  RegulationChunk,
  RegulationDocument,
  RetrievalOptions,
} from './schemas';

export interface RegulationSourceLoader {
  load(): Promise<RawRegulationCorpus>;
}

export interface ProcessedRegulationLoader {
  load(): Promise<ProcessedRegulationCorpus>;
}

export interface RegulationParser {
  parse(corpus: RawRegulationCorpus): {
    documents: RegulationDocument[];
    chunks: RegulationChunk[];
  };
}

export interface RegulationRepository {
  saveDocuments(documents: RegulationDocument[]): Promise<void>;
  saveChunks(chunks: RegulationChunk[]): Promise<void>;
  findDocument(id: string): Promise<RegulationDocument | null>;
  findChunk(id: string): Promise<RegulationChunk | null>;
  findRelevantChunks(
    query: string,
    options: RetrievalOptions,
  ): Promise<RegulationChunk[]>;
}
