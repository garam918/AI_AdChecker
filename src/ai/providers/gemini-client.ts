import { z } from 'zod';
import { vertexRequestConfig, type VertexEnv } from './vertex-auth';

export const GEMINI_MODEL = 'gemini-3.8-flash';

export class AIAnalysisError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'AIAnalysisError';
  }
}

const EnvelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export type GeminiImage = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: string;
};

export type GenerateOptions = {
  image?: GeminiImage;
  thinking?: 'low' | 'medium';
};

/**
 * Gemini on Vertex AI over REST with structured JSON output.
 *
 * Authentication is resolved per request from the environment (express-mode
 * API key or a project with service-account / access-token credentials) so
 * no secret is read during import or build.
 */
export class GeminiClient {
  constructor(
    private readonly options: {
      /** Test hook: express-mode key override. Prefer `env` in production. */
      apiKey?: () => string | undefined;
      env?: VertexEnv;
      fetch?: typeof fetch;
      timeoutMs?: number;
      /** Retries for explicit 503 overload only. Default 2. */
      retries?: number;
    } = {},
  ) {}

  get model() {
    return (
      this.options.env?.VERTEX_MODEL?.trim() ||
      process.env.VERTEX_MODEL?.trim() ||
      GEMINI_MODEL
    );
  }

  async generate<T>(
    schema: z.ZodType<T>,
    instructions: string,
    data: unknown,
    options: GenerateOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 60_000,
    );
    try {
      let config;
      try {
        config = await vertexRequestConfig(
          this.options.apiKey
            ? { VERTEX_API_KEY: this.options.apiKey() }
            : (this.options.env ?? process.env),
          this.model,
          this.options.fetch ?? fetch,
          controller.signal,
        );
      } catch {
        throw new AIAnalysisError(
          'AI_NOT_CONFIGURED',
          'Vertex AI 연결이 아직 설정되지 않았습니다. 서버의 VERTEX_API_KEY 또는 GOOGLE_CLOUD_PROJECT와 서비스 계정 설정을 확인해 주세요.',
          503,
        );
      }
      const response = await this.request(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...config.headers,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [
            {
              role: 'user',
              parts: [
                ...(options.image ? [{ inlineData: options.image }] : []),
                { text: JSON.stringify(data) },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: geminiResponseSchema(
              z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
            ),
            thinkingConfig: this.model.startsWith('gemini-2.5')
              ? { thinkingBudget: options.thinking === 'medium' ? 2048 : 0 }
              : { thinkingLevel: options.thinking ?? 'low' },
            maxOutputTokens: 12_000,
          },
        }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          const dailyLimit = await hasDailyQuotaFailure(response);
          throw new AIAnalysisError(
            dailyLimit ? 'AI_DAILY_LIMIT' : 'AI_RATE_LIMIT',
            dailyLimit
              ? 'Vertex AI 일일 사용 한도에 도달했습니다. 한도가 초기화되거나 운영자가 할당량을 조정한 뒤 다시 시도해 주세요.'
              : 'Vertex AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
            429,
          );
        }
        await response.body?.cancel();
        if (response.status === 503)
          throw new AIAnalysisError(
            'AI_BUSY',
            'Vertex AI 요청이 일시적으로 몰리고 있습니다. 잠시 후 다시 시도해 주세요.',
            503,
          );
        if (response.status === 400)
          throw new AIAnalysisError(
            'AI_REQUEST_REJECTED',
            'Vertex AI가 분석 요청 형식을 처리하지 못했습니다. 운영자의 연결 설정 확인이 필요합니다.',
            502,
          );
        if ([401, 403].includes(response.status))
          throw new AIAnalysisError(
            'AI_AUTH_FAILED',
            'Vertex AI 인증 또는 모델 접근 권한을 확인해 주세요.',
            503,
          );
        if (response.status === 404)
          throw new AIAnalysisError(
            'AI_MODEL_NOT_FOUND',
            '설정된 Vertex AI 모델 또는 리전을 찾을 수 없습니다. VERTEX_MODEL과 GOOGLE_CLOUD_LOCATION을 확인해 주세요.',
            503,
          );
        throw new AIAnalysisError(
          'AI_UNAVAILABLE',
          'Vertex AI 분석 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          502,
        );
      }
      // Bound the body while reading, including chunked responses.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing body');
      const decoder = new TextDecoder();
      let body = '';
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) {
          await reader.cancel();
          throw new Error('Response too large');
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
      const envelope = EnvelopeSchema.parse(JSON.parse(body));
      const candidate = envelope.candidates?.[0];
      if (
        envelope.promptFeedback?.blockReason ||
        candidate?.finishReason !== 'STOP'
      ) {
        throw new AIAnalysisError(
          'AI_INCOMPLETE',
          'Vertex AI가 완전한 분석 응답을 반환하지 않았습니다. 내용을 줄이거나 다른 이미지로 다시 시도해 주세요.',
        );
      }
      const text = candidate.content?.parts
        .filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('');
      return schema.parse(JSON.parse(text ?? ''));
    } catch (error) {
      if (error instanceof AIAnalysisError) throw error;
      if (controller.signal.aborted)
        throw new AIAnalysisError(
          'AI_TIMEOUT',
          'Vertex AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
          504,
        );
      // Never expose upstream bodies, prompts, URLs, keys or parser details.
      throw new AIAnalysisError(
        'AI_INVALID_RESPONSE',
        'Vertex AI 분석 응답을 검증하지 못했습니다. 결과를 생성하지 않았습니다.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const fetcher = this.options.fetch ?? fetch;
    const retries = this.options.retries ?? 2;
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetcher(url, init);
      // Retry only explicit temporary unavailability, within the original deadline.
      // Never repeat successful generation, malformed output, quota errors or ambiguous network failures.
      if (response.status !== 503 || attempt === retries) return response;
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const signal = init.signal;
        const abort = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          reject(new Error('Request aborted'));
        };
        const timer = setTimeout(
          () => {
            signal?.removeEventListener('abort', abort);
            resolve();
          },
          1500 * 2 ** attempt,
        );
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }
}

// Gemini supports only a subset of JSON Schema. String-length and array-size
// constraints stay in the Zod validator; forwarding them can reject otherwise
// valid requests or expand the constrained-decoding grammar.
const UNSUPPORTED_SCHEMA_KEYWORDS = [
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
];

export function geminiResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiResponseSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.includes(key))
      .map(([key, nested]) => [key, geminiResponseSchema(nested)]),
  );
}

async function hasDailyQuotaFailure(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  let body = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32_000) return false;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const parsed = z
      .object({
        error: z.object({
          details: z
            .array(
              z.object({
                violations: z
                  .array(z.object({ quotaId: z.string().optional() }))
                  .optional(),
              }),
            )
            .optional(),
        }),
      })
      .safeParse(JSON.parse(body));
    return (
      parsed.success &&
      Boolean(
        parsed.data.error.details?.some((detail) =>
          detail.violations?.some((violation) =>
            violation.quotaId?.includes('PerDay'),
          ),
        ),
      )
    );
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
