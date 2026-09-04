import type { RegulationSource } from '../../core/schemas';

/**
 * This source is intentionally not a legal citation. It keeps the MVP data
 * contract realistic without inventing an act, article, or official URL.
 * Replace it with validated retrieval results in a production analyzer.
 */
export const GENERAL_ADVERTISING_DEMO_SOURCE: RegulationSource = {
  id: 'demo-general-advertising-source',
  title: 'DEMO DATA — 광고 표현 검토 원칙(예시)',
  authority: 'ContentLint AI Demo',
  provision: null,
  text: '객관적 수치와 비교 우위 표현은 그 내용을 뒷받침하는 검증 가능한 근거와 함께 검토해야 합니다.',
  sourceUrl: null,
  isDemoData: true,
};

export const SAFE_DEMO_REWRITE =
  '반복 업무를 줄여 업무 효율 개선을 지원하는 AI 서비스';
