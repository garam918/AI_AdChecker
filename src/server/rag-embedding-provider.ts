import { HttpEmbeddingProvider } from '@/src/ai/providers/http-embedding-provider';
import type { EmbeddingProvider } from '@/src/compliance/regulatory/embedding-provider';

export function createEmbeddingProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProvider | null {
  const provider = env.RAG_EMBEDDING_PROVIDER ?? 'none';
  if (provider === 'none') return null;
  if (provider !== 'openai' && provider !== 'ollama') {
    throw new Error(
      'RAG_EMBEDDING_PROVIDER는 none, openai, ollama 중 하나여야 합니다.',
    );
  }
  const model =
    env.RAG_EMBEDDING_MODEL ||
    (provider === 'openai' ? 'text-embedding-3-small' : '');
  const dimensions = Number(
    env.RAG_EMBEDDING_DIMENSIONS || (provider === 'openai' ? '1536' : '0'),
  );
  if (
    !model ||
    !Number.isInteger(dimensions) ||
    dimensions < 1 ||
    dimensions > 4096
  ) {
    throw new Error(
      '임베딩 모델과 출력 차원(1~4096)을 서버 환경변수에 설정해 주세요.',
    );
  }
  return new HttpEmbeddingProvider(
    { provider, model, dimensions },
    {
      apiKey:
        provider === 'openai' ? env.OPENAI_API_KEY : env.RAG_OLLAMA_API_KEY,
      ollamaBaseUrl: env.RAG_OLLAMA_BASE_URL,
    },
  );
}
