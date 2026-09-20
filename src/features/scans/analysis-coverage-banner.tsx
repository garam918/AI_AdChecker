import { Info } from 'lucide-react';
import { getAnalysisCoverage } from '@/src/compliance/core/analysis-coverage';
import type { ScanAnalysisResult } from '@/src/compliance/core/schemas';

export function AnalysisCoverageBanner({
  result,
}: {
  result: ScanAnalysisResult;
}) {
  const coverage = getAnalysisCoverage(result);
  if (coverage.state === 'COMPLETE') return null;
  return (
    <section
      aria-label="분석 완료 범위"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Info className="size-4 shrink-0" />
        {coverage.label}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {coverage.state === 'PARTIAL'
          ? coverage.reasons.join(' · ')
          : '이 결과에는 최종 AI 완료 기록이 없습니다. 현재 내용을 다시 검사해 확인하세요.'}
      </p>
      <p className="mt-1 text-sm leading-6">
        {result.issues.length
          ? '아래에서 발견한 표현은 확인할 수 있지만, 표시되지 않은 다른 위험까지 검토됐다는 뜻은 아닙니다.'
          : '이번 범위에서 표시할 이슈를 찾지 못했습니다. 위험이 낮거나 게시해도 된다는 뜻은 아닙니다.'}
      </p>
    </section>
  );
}
