import type { ExtractedWebContent } from './schemas';
import type { WebContentExtractor } from './web-content-extractor';

type CacheEntry = {
  expiresAt: number;
  content: ExtractedWebContent;
};

export class CachedWebContentExtractor implements WebContentExtractor {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly delegate: WebContentExtractor,
    private readonly ttlMilliseconds = 5 * 60 * 1_000,
    private readonly maximumEntries = 50,
  ) {}

  async extract(url: string) {
    const key = new URL(url).toString();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.content;
    if (cached) this.cache.delete(key);

    const content = await this.delegate.extract(key);
    if (this.cache.size >= this.maximumEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      expiresAt: Date.now() + this.ttlMilliseconds,
      content,
    });
    return content;
  }
}
