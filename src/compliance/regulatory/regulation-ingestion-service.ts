import type {
  RegulationParser,
  RegulationRepository,
  RegulationSourceLoader,
} from './ingestion';

export class RegulationIngestionService {
  constructor(
    private readonly sourceLoader: RegulationSourceLoader,
    private readonly parser: RegulationParser,
    private readonly repository: RegulationRepository,
  ) {}

  async ingest() {
    const corpus = await this.sourceLoader.load();
    const parsed = this.parser.parse(corpus);
    await this.repository.saveDocuments(parsed.documents);
    await this.repository.saveChunks(parsed.chunks);

    return {
      documentCount: parsed.documents.length,
      chunkCount: parsed.chunks.length,
    };
  }
}
