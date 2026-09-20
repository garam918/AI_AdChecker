import { z } from 'zod';

import {
  AIAnalysisError,
  GeminiClient,
  type GeminiImage,
  type GenerateOptions,
} from './gemini-client';
import type { VertexEnv } from './vertex-auth';

export type AIAttempt = {
  provider: 'vertex' | 'openai';
  model: string;
  elapsedMs: number;
  outcome: 'success' | 'error';
  code?: string;
};

export interface StructuredAIClient {
  readonly model: string;
  generate<T>(
    schema: z.ZodType<T>,
    instructions: string,
    data: unknown,
    options?: GenerateOptions,
  ): Promise<T>;
}

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
export const AI_REQUEST_BUDGET_MS = 65_000;
const PRIMARY_CALL_TIMEOUT_MS = 35_000;
const FALLBACK_CALL_TIMEOUT_MS = 25_000;
const MAX_RETRY_WAIT_MS = 5_000;

/**
 * Primary Vertex AI Gemini call with an optional OpenAI fallback.
 *
 * Fallback fires only for provider-side failures (auth, quota, overload,
 * timeout, malformed output). A safety block (`AI_INCOMPLETE`) is never
 * retried through a different provider. Every attempt is recorded so the
 * result can show which model produced it and how long each step took.
 * With no alternate provider, one explicit temporary 429/503 failure may be
 * retried after a bounded jittered backoff, within the same request deadline.
 */
export class ResilientAIClient implements StructuredAIClient {
  readonly attempts: AIAttempt[] = [];
  private readonly vertex: GeminiClient;
  private readonly deadline: number;

  constructor(
    private readonly env: VertexEnv = process.env,
    private readonly fetcher: typeof fetch = fetch,
    budgetMs = AI_REQUEST_BUDGET_MS,
  ) {
    this.deadline = Date.now() + budgetMs;
    // One shared budget covers all calls, not a new full deadline per claim batch.
    this.vertex = new GeminiClient({
      env,
      fetch: fetcher,
      retries: 0,
      timeoutMs: PRIMARY_CALL_TIMEOUT_MS,
    });
  }

  get model() {
    const successful = [
      ...new Set(
        this.attempts
          .filter((attempt) => attempt.outcome === 'success')
          .map((attempt) => `${attempt.provider}/${attempt.model}`),
      ),
    ];
    return successful.join(' + ') || `vertex/${this.vertex.model}`;
  }

  get fallbackConfigured() {
    return (
      this.env.AI_FALLBACK_PROVIDER !== 'none' &&
      Boolean(this.env.OPENAI_API_KEY?.trim())
    );
  }

  async generate<T>(
    schema: z.ZodType<T>,
    instructions: string,
    data: unknown,
    options: GenerateOptions = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const primaryStart = Date.now();
      const remaining = this.deadline - primaryStart;
      if (remaining <= 0)
        throw new AIAnalysisError(
          'AI_BUDGET_EXCEEDED',
          'AI 분석 시간 한도에 도달했습니다. 내용을 나누어 검사해 주세요.',
          504,
        );
      try {
        const result = await this.vertex.generate(schema, instructions, data, {
          ...options,
          timeoutMs: Math.min(PRIMARY_CALL_TIMEOUT_MS, remaining),
        });
        this.record('vertex', this.vertex.model, primaryStart, 'success');
        return result;
      } catch (error) {
        this.record('vertex', this.vertex.model, primaryStart, 'error', error);
        if (error instanceof AIAnalysisError && error.code === 'AI_INCOMPLETE')
          throw error;
        if (this.fallbackConfigured) break;
        // Do not repeat ambiguous network errors, timeouts, malformed output,
        // safety refusals, authentication errors or explicit daily exhaustion.
        if (
          attempt > 0 ||
          !(error instanceof AIAnalysisError) ||
          !['AI_RATE_LIMIT', 'AI_BUSY'].includes(error.code)
        )
          throw error;
        const waitMs = Math.max(
          1500 + Math.random() * 500,
          error.retryAfterMs ?? 0,
        );
        if (
          waitMs > MAX_RETRY_WAIT_MS ||
          this.deadline - Date.now() < waitMs + 1000
        )
          throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }

    const model =
      this.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const fallbackStart = Date.now();
    const fallbackRemaining = this.deadline - fallbackStart;
    if (fallbackRemaining <= 0)
      throw new AIAnalysisError(
        'AI_BUDGET_EXCEEDED',
        '대체 AI를 실행할 시간이 남지 않았습니다. 내용을 나누어 검사해 주세요.',
        504,
      );
    try {
      const result = await this.openai(
        schema,
        instructions,
        data,
        options.image,
        model,
        Math.min(FALLBACK_CALL_TIMEOUT_MS, fallbackRemaining),
      );
      this.record('openai', model, fallbackStart, 'success');
      return result;
    } catch (error) {
      this.record('openai', model, fallbackStart, 'error', error);
      if (error instanceof AIAnalysisError && error.code === 'AI_INCOMPLETE')
        throw error;
      throw new AIAnalysisError(
        'AI_ALL_PROVIDERS_FAILED',
        '기본·대체 AI 모두 분석을 완료하지 못했습니다. 잠시 후 다시 검사해 주세요.',
        503,
      );
    }
  }

  private record(
    provider: AIAttempt['provider'],
    model: string,
    startedAt: number,
    outcome: AIAttempt['outcome'],
    error?: unknown,
  ) {
    this.attempts.push({
      provider,
      model,
      elapsedMs: Date.now() - startedAt,
      outcome,
      ...(outcome === 'error' && {
        code: error instanceof AIAnalysisError ? error.code : 'AI_UNAVAILABLE',
      }),
    });
  }

  private async openai<T>(
    schema: z.ZodType<T>,
    instructions: string,
    data: unknown,
    image: GeminiImage | undefined,
    model: string,
    timeoutMs: number,
  ): Promise<T> {
    const response = await this.fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.env.OPENAI_API_KEY?.trim()}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: JSON.stringify(data) },
              ...(image
                ? [
                    {
                      type: 'input_image',
                      image_url: `data:${image.mimeType};base64,${image.data}`,
                      detail: 'high',
                    },
                  ]
                : []),
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'analysis',
            strict: true,
            schema: z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }),
          },
        },
        max_output_tokens: 12_000,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AIAnalysisError('AI_UNAVAILABLE', '대체 AI 응답 오류');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing response body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
    const envelope = z
      .object({
        status: z.literal('completed'),
        output: z.array(
          z.object({
            type: z.string(),
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        ),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const content = envelope.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? []);
    if (content.some((item) => item.type === 'refusal'))
      throw new AIAnalysisError(
        'AI_INCOMPLETE',
        '대체 AI가 응답을 거부했습니다.',
      );
    return schema.parse(
      JSON.parse(
        content
          .filter((item) => item.type === 'output_text')
          .map((item) => item.text ?? '')
          .join(''),
      ),
    );
  }
}
