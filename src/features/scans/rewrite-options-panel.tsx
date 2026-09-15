'use client';

import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getRewriteOptions,
  canApplyRewrite,
} from '@/src/compliance/core/rewrite-options';
import type { Issue, RewriteOption } from '@/src/compliance/core/schemas';
import { applyDraftEdits } from './rewrite-draft';

export function RewriteOptionsPanel({
  issue,
  draftText,
  selectedId,
  onSelect,
  onApply,
  onCopy,
  copied,
}: {
  issue: Issue;
  draftText: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onApply?: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const options = getRewriteOptions(issue);
  const ready = options.filter(canApplyRewrite);
  const conditional = options.filter((option) => !canApplyRewrite(option));
  const selected = options.find((option) => option.id === selectedId);
  const preview =
    selected && canApplyRewrite(selected)
      ? applyDraftEdits(draftText, [{ issue, option: selected }])
      : null;
  const renderOption = (option: RewriteOption) => (
    <label
      key={option.id}
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-focus-visible:ring-2 has-focus-visible:ring-indigo-500 ${selectedId === option.id ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'}`}
    >
      <input
        type="radio"
        name={`rewrite-${issue.id}`}
        checked={selectedId === option.id}
        onChange={() => onSelect(option.id)}
        className="mt-1 accent-indigo-600"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-indigo-800">
          {option.label}
        </span>
        {option.text && (
          <span className="mt-1 block text-sm leading-6 text-slate-800">
            {option.text}
          </span>
        )}
        <span className="mt-1 block text-xs leading-5 text-slate-600">
          {option.explanation}
        </span>
      </span>
    </label>
  );
  return (
    <section className="space-y-3" aria-label="수정 방향 선택">
      <h3 className="text-sm font-semibold text-slate-900">수정 방향</h3>
      {ready.map(renderOption)}
      {conditional.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">
            증빙·직접 검토가 필요한 제안 {conditional.length}개
          </summary>
          <p className="my-2 text-xs leading-5 text-amber-900">
            바로 게시할 문구가 아닙니다. 대괄호나 수치·수상 내역을 확인하지 않고
            적용하지 마세요.
          </p>
          <div className="space-y-2">{conditional.map(renderOption)}</div>
        </details>
      )}
      {preview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">
            적용 후 문장 미리보기
          </p>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {preview.text}
          </p>
          {preview.skipped.map((item) => (
            <p key={item.issueId} className="mt-2 text-xs text-amber-800">
              {item.reason}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {onApply && (
          <Button
            onClick={onApply}
            disabled={!preview?.appliedIssueIds.length}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            선택한 방향을 초안에 반영
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onCopy}
          disabled={!selected?.text}
          aria-label="선택한 제안 복사"
        >
          {copied ? <Check /> : <Copy />}
          {copied ? '복사됨' : '제안 복사'}
        </Button>
      </div>
      <p className="text-xs leading-5 text-slate-600">
        적용은 게시 승인이 아닙니다. 초안을 읽고 재검사한 뒤 남은 증빙과 실제
        조건을 확인하세요.
      </p>
    </section>
  );
}
