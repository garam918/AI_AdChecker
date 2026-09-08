import { z } from 'zod';

export const EmbeddingIdentitySchema = z.object({
  provider: z.enum(['openai', 'ollama']),
  model: z.string().min(1),
  dimensions: z.number().int().positive().max(4096),
});

export type EmbeddingIdentity = z.infer<typeof EmbeddingIdentitySchema>;

export interface EmbeddingProvider {
  readonly identity: EmbeddingIdentity;
  embed(texts: string[]): Promise<number[][]>;
}

export function sameEmbeddingIdentity(
  left: EmbeddingIdentity | null,
  right: EmbeddingIdentity | null,
) {
  return (
    left?.provider === right?.provider &&
    left?.model === right?.model &&
    left?.dimensions === right?.dimensions
  );
}

export function validateVectors(
  value: unknown,
  count: number,
  dimensions: number,
) {
  const parsed = z
    .array(z.array(z.number()).length(dimensions))
    .length(count)
    .safeParse(value);
  if (
    !parsed.success ||
    parsed.data.some((vector) => {
      const squaredNorm = vector.reduce((sum, value) => sum + value * value, 0);
      return squaredNorm === 0 || !Number.isFinite(squaredNorm);
    })
  ) {
    throw new Error('임베딩 응답의 개수·차원·수치가 올바르지 않습니다.');
  }
  return parsed.data;
}
