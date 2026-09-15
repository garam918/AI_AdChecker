import type { ScanAnalysisResult } from '@/src/compliance/core/schemas';

export type PreviousReview = { text: string; result: ScanAnalysisResult };

export function ReviewComparison({
  previous,
  currentText,
  result,
}: {
  previous: PreviousReview;
  currentText: string;
  result: ScanAnalysisResult;
}) {
  const removed = previous.result.issues.filter(
    (issue) => !currentText.includes(issue.originalText),
  );
  return (
    <details className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-indigo-900">
        재검사 비교 · 이전 표현 {removed.length}개 제거 · 현재 검토 항목{' '}
        {result.issues.length}개
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
        <p>
          표현이 제거됐다는 것은 그 문구가 초안에 더 없다는 뜻입니다. 적법성이나
          모든 위험의 해소를 의미하지 않습니다.
        </p>
        <ul className="space-y-2">
          {previous.result.issues.map((issue) => (
            <li key={issue.id} className="rounded-lg bg-white p-3">
              <span className="font-medium">“{issue.originalText}”</span>
              <span className="mt-1 block text-xs text-slate-600">
                {!currentText.includes(issue.originalText)
                  ? '이전 표현이 초안에서 제거됨'
                  : result.issues.some(
                        (next) =>
                          next.originalText.includes(issue.originalText) ||
                          issue.originalText.includes(next.originalText),
                      )
                    ? '같거나 겹치는 표현이 다시 탐지됨 · 현재 이슈의 근거·증빙 확인 필요'
                    : '원문에는 남아 있으나 이번 분석에서는 같은 표현을 탐지하지 않음 · 직접 대조 필요'}
              </span>
            </li>
          ))}
        </ul>
        {result.issues.length > 0 && (
          <p>
            남은 항목은 아래 핵심 이슈에서 확인하세요. 조건부 문구를 추가하는
            것만으로 실제 증빙이 확인되지는 않습니다.
          </p>
        )}
        {result.overallRisk === 'REVIEW_REQUIRED' && (
          <p>
            이번 분석은 추가 검토가 필요합니다. 이슈 수가 줄었더라도
            분류·추출·분석 한계를 먼저 확인하세요.
          </p>
        )}
        {previous.result.inputType !== 'TEXT' && (
          <p className="font-medium text-amber-900">
            이번 재검사는 텍스트만 검사했습니다. 원래{' '}
            {previous.result.inputType === 'IMAGE'
              ? '이미지의 사진·배치'
              : '웹페이지의 다른 구간·실제 변경 내용'}
            까지 재검증한 것은 아닙니다.
          </p>
        )}
        <details>
          <summary className="cursor-pointer">이전 분석 원문</summary>
          <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3">
            {previous.text}
          </p>
        </details>
      </div>
    </details>
  );
}
