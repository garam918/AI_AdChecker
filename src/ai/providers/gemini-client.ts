import { z } from 'zod';

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

export class GeminiClient {
  constructor(
    private readonly options: {
      apiKey?: () => string | undefined;
      fetch?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {}

  async generate<T>(
    schema: z.ZodType<T>,
    instructions: string,
    data: unknown,
    options: { image?: GeminiImage; thinking?: 'low' | 'medium' } = {},
  ): Promise<T> {
    const key = (this.options.apiKey?.() ?? process.env.GEMINI_API_KEY)?.trim();
    if (!key)
      throw new AIAnalysisError(
        'AI_NOT_CONFIGURED',
        'Gemini 연결이 아직 설정되지 않았습니다. 서버의 GEMINI_API_KEY를 설정해 주세요.',
        503,
      );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 60_000,
    );
    try {
      const response = await this.request(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': key,
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
              responseFormat: {
                text: {
                  // REST TextResponseFormat uses an enum, not an HTTP MIME string.
                  mimeType: 'APPLICATION_JSON',
                  schema: geminiResponseSchema(
                    z.toJSONSchema(schema, {
                      target: 'draft-7',
                      io: 'input',
                    }),
                  ),
                },
              },
              thinkingConfig: { thinkingLevel: options.thinking ?? 'low' },
              maxOutputTokens: 12_000,
            },
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 429) {
          const dailyLimit = await hasDailyQuotaFailure(response);
          throw new AIAnalysisError(
            dailyLimit ? 'AI_DAILY_LIMIT' : 'AI_RATE_LIMIT',
            dailyLimit
              ? 'Gemini 일일 사용 한도에 도달했습니다. 한도가 초기화되거나 운영자가 할당량을 조정한 뒤 다시 시도해 주세요.'
              : 'Gemini 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
            429,
          );
        }
        await response.body?.cancel();
        if (response.status === 503)
          throw new AIAnalysisError(
            'AI_BUSY',
            'Gemini 요청이 일시적으로 몰리고 있습니다. 잠시 후 다시 시도해 주세요.',
            503,
          );
        if (response.status === 400)
          throw new AIAnalysisError(
            'AI_REQUEST_REJECTED',
            'Gemini가 분석 요청 형식을 처리하지 못했습니다. 운영자의 연결 설정 확인이 필요합니다.',
            502,
          );
        if ([401, 403].includes(response.status))
          throw new AIAnalysisError(
            'AI_AUTH_FAILED',
            'Gemini 인증 또는 모델 접근 권한을 확인해 주세요.',
            503,
          );
        throw new AIAnalysisError(
          'AI_UNAVAILABLE',
          'Gemini 분석 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
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
          'Gemini가 완전한 분석 응답을 반환하지 않았습니다. 내용을 줄이거나 다른 이미지로 다시 시도해 주세요.',
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
          'Gemini 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
          504,
        );
      // Never expose upstream bodies, prompts, URLs, keys or parser details.
      throw new AIAnalysisError(
        'AI_INVALID_RESPONSE',
        'Gemini 분석 응답을 검증하지 못했습니다. 결과를 생성하지 않았습니다.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const fetcher = this.options.fetch ?? fetch;
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetcher(url, init);
      // Retry only explicit temporary unavailability, within the original deadline.
      // Never repeat successful generation, malformed output, quota errors or ambiguous network failures.
      if (response.status !== 503 || attempt === 2) return response;
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

// Keep cardinality and string bounds in Zod. Nested bounded arrays can exceed
// Gemini's structured-output grammar limits even for a small findings schema.
export function geminiResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiResponseSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            '$schema',
            'minLength',
            'maxLength',
            'minItems',
            'maxItems',
          ].includes(key),
      )
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
