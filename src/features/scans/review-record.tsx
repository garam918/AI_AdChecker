'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ReviewRecord({
  completedMs,
  draftChanged,
  note,
  onNote,
  onComplete,
  onSave,
  notice,
}: {
  completedMs: number | null;
  draftChanged: boolean;
  note: string;
  onNote: (text: string) => void;
  onComplete: () => void;
  onSave: () => void;
  notice: string | null;
}) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="검토 완료와 기록 보관"
    >
      <h2 className="font-semibold text-slate-900">검토 결과 기록</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        검토 종료는 게시 승인이 아닙니다. 남은 증빙·검토 사항을 메모하고 결과를
        보관할 수 있습니다.
      </p>
      <label
        htmlFor="review-note"
        className="mt-4 block text-sm font-medium text-slate-700"
      >
        검토 메모 · 오탐 의심·누락·남은 증빙
      </label>
      <Textarea
        id="review-note"
        className="mt-2"
        maxLength={2000}
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="예: 수치 주장을 삭제함. 실제 시험 자료와 거래조건은 담당자가 확인 필요."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onComplete}
          disabled={completedMs !== null || draftChanged}
        >
          {completedMs !== null
            ? '검토 시간 기록됨'
            : '이번 검토 종료 · 시간 기록'}
        </Button>
        <Button variant="outline" onClick={onSave}>
          이 브라우저에 결과 저장
        </Button>
      </div>
      {completedMs !== null && (
        <output className="mt-3 block text-sm font-medium text-indigo-800">
          첫 분석 요청부터 검토 종료까지 {(completedMs / 1000).toFixed(1)}초 ·
          대기·읽기·수정·재검사 포함
        </output>
      )}
      {draftChanged && (
        <p className="mt-2 text-xs text-amber-800">
          초안이 분석한 원문과 다릅니다. 시간 기록 전에 수정 초안을
          재검사하세요.
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-600">
        이 시간은 이번 브라우저 작업의 경과 시간이며 수동 검수 대비 절감 효과가
        아닙니다. 메모와 저장 기록은 서버로 전송하지 않습니다. 광고
        원문·결과·초안은 이 브라우저에 최대 10개 저장되며, 새 저장 시 가장
        오래된 기록이 교체됩니다. 이미지 원본은 저장하지 않습니다. 공용
        컴퓨터에서는 저장에 주의하세요.
      </p>
      {notice && (
        <output className="mt-3 block text-sm text-slate-700">{notice}</output>
      )}
    </section>
  );
}
