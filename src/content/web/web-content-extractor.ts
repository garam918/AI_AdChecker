import type { ExtractedWebContent } from './schemas';

export interface WebContentExtractor {
  extract(url: string): Promise<ExtractedWebContent>;
}
