import { z } from 'zod';
import {
  EmbeddingIdentitySchema,
  validateVectors,
  type EmbeddingIdentity,
  type EmbeddingProvider,
} from '@/src/compliance/regulatory/embedding-provider';

const OpenAIResponseSchema = z.object({
  model: z.string(),
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()),
    }),
  ),
});
const OllamaResponseSchema = z.object({
  model: z.string(),
  embeddings: z.array(z.array(z.number())),
});

/** Server-only configuration; URLs and credentials never come from scan input. */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly identity: EmbeddingIdentity;
  private readonly endpoint: string;

  constructor(
    identity: EmbeddingIdentity,
    private readonly options: {
      apiKey?: string;
      ollamaBaseUrl?: string;
      fetcher?: typeof fetch;
    } = {},
  ) {
    this.identity = EmbeddingIdentitySchema.parse(identity);
    if (identity.provider === 'openai') {
      if (!options.apiKey?.trim())
        throw new Error('서버에 OPENAI_API_KEY를 설정해 주세요.');
      this.endpoint = 'https://api.openai.com/v1/embeddings';
    } else {
      const base = new URL(options.ollamaBaseUrl ?? 'http://127.0.0.1:11434');
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
        base.hostname,
      );
      if (
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback))
      ) {
        throw new Error(
          'Ollama는 로컬 HTTP 주소 또는 인증정보가 없는 HTTPS 주소를 사용해 주세요.',
        );
      }
      this.endpoint = new URL(
        'api/embed',
        `${base.href.replace(/\/$/, '')}/`,
      ).href;
    }
  }

  async embed(texts: string[]) {
    if (texts.length === 0) return [];
    // Conservative UTF-8 byte cap also bounds token input without truncating law text.
    if (
      texts.length > 32 ||
      texts.some(
        (text) => !text.trim() || new TextEncoder().encode(text).length > 8000,
      )
    ) {
      throw new Error(
        '임베딩 입력 한도(32개, 항목당 UTF-8 8,000바이트)를 초과했습니다. 조항을 구조에 맞게 나눠 주세요.',
      );
    }
    const openai = this.identity.provider === 'openai';
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey && {
            Authorization: `Bearer ${this.options.apiKey}`,
          }),
        },
        body: JSON.stringify({
          model: this.identity.model,
          input: texts,
          dimensions: this.identity.dimensions,
          ...(openai ? { encoding_format: 'float' } : { truncate: false }),
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(
        '임베딩 서버에 연결하지 못했습니다. 주소와 실행 상태를 확인해 주세요.',
      );
    }
    if (!response.ok) {
      // Never forward a vendor body that may contain submitted text or secrets.
      throw new Error(
        `임베딩 요청이 실패했습니다(HTTP ${response.status}). 결과를 생성하지 않았습니다.`,
      );
    }
    let vectors: unknown;
    try {
      const body: unknown = await response.json();
      if (openai) {
        const parsed = OpenAIResponseSchema.parse(body);
        const sorted = parsed.data.sort((a, b) => a.index - b.index);
        if (
          parsed.model !== this.identity.model ||
          sorted.some((item, index) => item.index !== index)
        ) {
          throw new Error('Embedding response model/index mismatch');
        }
        vectors = sorted.map((item) => item.embedding);
      } else {
        const parsed = OllamaResponseSchema.parse(body);
        if (parsed.model !== this.identity.model)
          throw new Error('Embedding model mismatch');
        vectors = parsed.embeddings;
      }
    } catch {
      throw new Error(
        '임베딩 서버가 올바른 구조의 응답을 반환하지 않았습니다.',
      );
    }
    return validateVectors(vectors, texts.length, this.identity.dimensions);
  }
}
