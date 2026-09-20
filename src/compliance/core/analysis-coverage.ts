/** Analysis coverage is independent of the severity of findings already found. */
type CoverageInput = {
  analysisModel?: string;
  metrics?: { mode: 'live' | 'offline' };
  imageContent?: { incomplete: boolean };
  webContent?: { contentTruncated: boolean };
  notices: Array<{ code: string }>;
};

export function getAnalysisCoverage(result: CoverageInput) {
  const codes = new Set(result.notices.map((notice) => notice.code));
  const reasons: string[] = [];
  if (
    result.metrics?.mode === 'offline' ||
    result.analysisModel === 'rules-only' ||
    codes.has('AI_UNAVAILABLE_RULES_ONLY')
  ) {
    reasons.push('AI 문맥 검토 미완료 · 규칙으로 찾은 표현만 표시');
  }
  if (result.imageContent?.incomplete)
    reasons.push('이미지 일부 내용 인식 불가');
  if (result.webContent?.contentTruncated || codes.has('CONTENT_TRUNCATED')) {
    reasons.push('웹페이지 일부 구간만 검사');
  }
  if (codes.has('AI_REVIEW_REQUIRED'))
    reasons.push('광고 주장 추출 범위 확인 필요');
  if (codes.has('UNKNOWN_CATEGORY')) reasons.push('제품 유형 확인 필요');
  if (reasons.length) {
    return {
      state: 'PARTIAL' as const,
      label: '부분 분석 · 추가 확인 필요',
      reasons,
    };
  }
  if (result.metrics?.mode === 'live') {
    return {
      state: 'COMPLETE' as const,
      label: 'AI 검토 완료 · 지원 범위 내',
      reasons,
    };
  }
  // Older saved reports and internal rules-only evaluations have no runtime trace.
  return { state: 'UNVERIFIED' as const, label: 'AI 완료 기록 없음', reasons };
}
