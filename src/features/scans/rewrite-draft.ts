import {
  canApplyRewrite,
  getRewriteOptions,
} from '@/src/compliance/core/rewrite-options';
import type { Issue, RewriteOption } from '@/src/compliance/core/schemas';

export type DraftEdit = { issue: Issue; option: RewriteOption };
export type DraftEditResult = {
  text: string;
  appliedIssueIds: string[];
  skipped: Array<{ issueId: string; reason: string }>;
};

/** Edit the CURRENT draft, never regenerate it from an obsolete analysis. */
export function applyDraftEdits(
  draft: string,
  edits: DraftEdit[],
): DraftEditResult {
  const skipped: DraftEditResult['skipped'] = [];
  const ranges: Array<DraftEdit & { start: number; end: number }> = [];
  for (const edit of edits) {
    const { issue, option } = edit;
    const validated = getRewriteOptions(issue).find(
      (item) =>
        item.id === option.id &&
        item.text === option.text &&
        item.kind === option.kind,
    );
    if (!validated || !canApplyRewrite(validated)) {
      skipped.push({
        issueId: issue.id,
        reason: '증빙이나 직접 검토가 필요한 제안은 자동 적용하지 않습니다.',
      });
      continue;
    }
    const start = draft.indexOf(issue.originalText);
    if (start < 0) {
      skipped.push({
        issueId: issue.id,
        reason: '이 표현이 이미 변경됐습니다. 현재 초안을 재검사해 주세요.',
      });
      continue;
    }
    if (draft.indexOf(issue.originalText, start + 1) >= 0) {
      skipped.push({
        issueId: issue.id,
        reason:
          '동일한 표현이 여러 곳에 있습니다. 적용 위치를 직접 확인해 주세요.',
      });
      continue;
    }
    ranges.push({ ...edit, start, end: start + issue.originalText.length });
  }
  // Prefer the longest selected span and do not edit overlapping ranges twice.
  ranges.sort((a, b) => b.end - b.start - (a.end - a.start));
  const selected: typeof ranges = [];
  for (const range of ranges) {
    if (
      selected.some(
        (other) => range.start < other.end && range.end > other.start,
      )
    ) {
      skipped.push({
        issueId: range.issue.id,
        reason: '다른 수정과 원문 범위가 겹쳐 중복 적용하지 않았습니다.',
      });
    } else selected.push(range);
  }
  let text = draft;
  const appliedIssueIds: string[] = [];
  for (const { start, end, option, issue } of selected.sort(
    (a, b) => b.start - a.start,
  )) {
    let before = text.slice(0, start);
    let after = text.slice(end);
    const replacement = option.text.trim();
    let ambiguousSuffix = false;
    // A provider may include the original suffix (e.g. "AI 서비스") in its
    // replacement. Consume only whole whitespace-delimited matching tokens.
    if (replacement && /^\s/.test(after)) {
      const words = replacement.split(/\s+/);
      for (let index = 0; index < words.length; index += 1) {
        const suffix = words.slice(index).join(' ');
        const trimmed = after.trimStart();
        if (trimmed.startsWith(suffix)) {
          if (/^(?:\s|[.,!?]|$)/.test(trimmed.slice(suffix.length)))
            after = trimmed.slice(suffix.length);
          else ambiguousSuffix = true;
          break;
        }
      }
    }
    if (ambiguousSuffix) {
      skipped.push({
        issueId: issue.id,
        reason:
          '수정안과 뒤 문구가 일부 겹칩니다. 문장 전체를 직접 다듬어 주세요.',
      });
      continue;
    }
    if (!replacement) {
      if (!before || /[\t ]$/.test(before))
        after = after.replace(/^[\t ]+/, '');
      if (!after || /^[,.!?]/.test(after))
        before = before.replace(/[\t ]+$/, '');
    }
    text = before + replacement + after;
    appliedIssueIds.push(issue.id);
  }
  if (!text.trim() && appliedIssueIds.length) {
    return {
      text: draft,
      appliedIssueIds: [],
      skipped: [
        ...skipped,
        ...selected.map(({ issue }) => ({
          issueId: issue.id,
          reason:
            '삭제하면 초안이 비게 됩니다. 제품의 실제 정보를 직접 작성해 주세요.',
        })),
      ],
    };
  }
  return {
    text,
    appliedIssueIds,
    skipped,
  };
}

export function removeFlaggedClaims(draft: string, issues: Issue[]) {
  return applyDraftEdits(
    draft,
    issues.flatMap((issue) => {
      const option = getRewriteOptions(issue).find(
        (item) => item.kind === 'REMOVE',
      );
      return option ? [{ issue, option }] : [];
    }),
  );
}
