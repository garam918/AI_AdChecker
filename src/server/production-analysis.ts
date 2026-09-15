import { GeminiContentProvider } from '@/src/ai/providers/gemini-content-provider';
import { ResilientAIClient } from '@/src/ai/providers/resilient-ai-client';
import type { VertexEnv } from '@/src/ai/providers/vertex-auth';
import { FallbackComplianceScanService } from '@/src/compliance/core/fallback-compliance-scan-service';
import type { ScanAnalysisResult } from '@/src/compliance/core/schemas';
import { ImageComplianceScanService } from '@/src/content/image/image-compliance-scan-service';

import { createContentComplianceScanService } from './regulatory-runtime';
import { createUrlComplianceScanService } from './url-scan-runtime';

/**
 * Builds the per-request analysis stack used by the API routes.
 *
 * Provider chain: Vertex AI Gemini → OpenAI (when `OPENAI_API_KEY` is set and
 * `AI_FALLBACK_PROVIDER` is not `none`) → deterministic rules + retrieval
 * (unless `AI_RULES_FALLBACK=off`). Each request owns its own client so
 * attempt traces from concurrent users never mix.
 */
export function createProductionAnalysis(
  options: { env?: VertexEnv; fetch?: typeof fetch } = {},
) {
  const env = options.env ?? process.env;
  const client = new ResilientAIClient(env, options.fetch);
  const provider = new GeminiContentProvider(client);
  const live = createContentComplianceScanService(provider);
  const rules = createContentComplianceScanService();
  const compliance = new FallbackComplianceScanService(live, rules, {
    enabled: env.AI_RULES_FALLBACK !== 'off',
  });

  return {
    text: compliance,
    url: createUrlComplianceScanService(compliance),
    image: new ImageComplianceScanService(provider, compliance),
    async measure(
      work: () => Promise<ScanAnalysisResult>,
    ): Promise<ScanAnalysisResult> {
      const started = Date.now();
      const result = await work();
      const offline = result.metrics?.mode === 'offline';
      return {
        ...result,
        analysisModel: offline ? result.analysisModel : client.model,
        metrics: {
          elapsedMs: Date.now() - started,
          mode: offline ? 'offline' : 'live',
          attempts: [...client.attempts],
        },
      };
    },
  };
}

export type ProductionAnalysis = ReturnType<typeof createProductionAnalysis>;
