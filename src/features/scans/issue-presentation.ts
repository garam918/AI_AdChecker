import type { Issue } from '@/src/compliance/core/schemas';

export function issueNextAction(issue: Issue): string {
  if (issue.citationStatus !== 'VERIFIED') return '근거를 확인한 뒤 직접 검토';
  if (issue.resolutionType === 'VERIFY_PRODUCT_CLASSIFICATION')
    return '제품 유형과 허가 범위 확인';
  if (issue.resolutionType === 'HUMAN_REVIEW')
    return '전체 맥락을 확인하고 직접 검토';
  if (issue.category === 'COMPARATIVE_CLAIM')
    return '비교 기준을 확인하거나 표현 수정';
  if (issue.resolutionType === 'PROVIDE_EVIDENCE')
    return '주장의 근거를 확인하거나 표현 수정';
  return '실제 제품 정보에 맞게 표현 수정';
}

export function conciseIssueReason(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 78
    ? `${normalized.slice(0, 77).trimEnd()}…`
    : normalized;
}
