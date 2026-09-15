import { AIAnalysisError } from '@/src/ai/providers/gemini-client';
import type { AnalysisProgress } from '@/src/ai/providers/content-analysis-provider';

import type { PackContentInput } from './compliance-pack';
import type { ContentComplianceScanService } from './content-compliance-scan-service';
import { ScanAnalysisResultSchema, type ScanAnalysisResult } from './schemas';

export const RULES_ONLY_MODEL = 'rules-only';

type ComplianceScanner = Pick<ContentComplianceScanService, 'analyzeContent'>;

/**
 * Runs the AI-assisted scan and, when every AI provider fails, re-runs the
 * same input through the deterministic rule + retrieval pipeline.
 *
 * The fallback result is never presented as an AI result: `analysisModel`
 * becomes `rules-only`, `metrics.mode` becomes `offline` and a notice tells
 * the user which signals were unavailable. Findings in the fallback are
 * still real, citation-verified rule hits — nothing is fabricated.
 */
export class FallbackComplianceScanService implements ComplianceScanner {
  constructor(
    private readonly primary: ComplianceScanner,
    private readonly fallback: ComplianceScanner,
    private readonly options: {
      enabled?: boolean;
      onFallback?: (error: AIAnalysisError) => void;
    } = {},
  ) {}

  async analyzeContent(
    input: PackContentInput,
    progress?: AnalysisProgress,
  ): Promise<ScanAnalysisResult> {
    try {
      return await this.primary.analyzeContent(input, progress);
    } catch (error) {
      if (!(error instanceof AIAnalysisError) || this.options.enabled === false)
        throw error;
      this.options.onFallback?.(error);
      const result = await this.fallback.analyzeContent(input, progress);
      return ScanAnalysisResultSchema.parse({
        ...result,
        analysisModel: RULES_ONLY_MODEL,
        metrics: { elapsedMs: 0, mode: 'offline', attempts: [] },
        notices: [
          {
            code: 'AI_UNAVAILABLE_RULES_ONLY',
            message: `AI 분석을 사용할 수 없어 규칙 기반 탐지와 공식 규정 검색만으로 결과를 만들었습니다 (${error.code}). 문맥 해석과 암시적 주장은 검토되지 않았으므로 게시 전 추가 확인이 필요합니다.`,
          },
          ...result.notices,
        ],
      });
    }
  }
}
