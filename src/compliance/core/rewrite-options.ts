import { RewriteOptionSchema, type Issue, type RewriteOption } from './schemas';

// These are conservative presentation guards, NOT a factual/legal verifier.
// Batch editing only removes claims; AI wording always requires a separate choice.
const CONDITIONAL =
  /\[[^\]]+\]|\{[^}]+\}|\d|최고|최초|최대|최소|유일|유수|선도|압도|보장|완벽|무조건|확실|인증|수상|선정|입증|검증|확인된|임상|시험|테스트|측정|실험|조사|평가|특허|허가|승인|전문가|의사|치료|예방|개선|강화|효능|부작용|안전|비교|보다|위험\s*없|조건.*기준/;
const INSTRUCTION =
  /확인해|확인한 뒤|검토해|검토한 뒤|작성해|작성한 뒤|제거해|제거한 뒤|기재해|기재한 뒤|대체해|바꿔|수정해|필요합니다|권장합니다/;

export function buildRewriteOptions(issue: Issue): RewriteOption[] {
  const canRemove =
    issue.citationStatus === 'VERIFIED' &&
    issue.resolutionType !== 'HUMAN_REVIEW' &&
    issue.resolutionType !== 'VERIFY_PRODUCT_CLASSIFICATION' &&
    !issue.originalText.includes('[시각 관찰]');
  const options: RewriteOption[] = canRemove
    ? [
        {
          id: `${issue.id}:remove`,
          kind: 'REMOVE',
          text: '',
          label: '이 주장 삭제',
          explanation:
            '새로운 사실을 추가하지 않고 이 표현만 제거합니다. 남은 문장과 제품 설명은 직접 확인하세요.',
        },
      ]
    : [];
  for (const [index, text] of [...new Set(issue.suggestedRewrites)].entries()) {
    const kind =
      !canRemove || INSTRUCTION.test(text)
        ? 'MANUAL_REVIEW'
        : CONDITIONAL.test(text) || text.trim() === issue.originalText.trim()
          ? 'CONDITIONAL'
          : 'REPLACE';
    options.push(
      RewriteOptionSchema.parse({
        id: `${issue.id}:suggestion:${index}`,
        kind,
        text,
        label:
          kind === 'REPLACE'
            ? '문구 제안'
            : kind === 'CONDITIONAL'
              ? '증빙 확인 후 작성'
              : '직접 검토 필요',
        explanation:
          kind === 'REPLACE'
            ? '문구 제안은 사실 확인이 아닙니다. 실제 제품 설명과 맞는지 확인한 뒤 초안에 적용하세요.'
            : kind === 'CONDITIONAL'
              ? '수치·성과·조건 등은 검증되지 않았습니다. 자동 적용하지 않으며, 실제 증빙을 확인한 뒤 직접 작성해야 합니다.'
              : '광고에 바로 붙이는 문구가 아닙니다. 원문과 적용 조건을 확인하고 직접 수정하세요.',
      }),
    );
  }
  return options;
}

export function getRewriteOptions(issue: Issue): RewriteOption[] {
  // Recompute from the cited issue, including when an older saved result is opened.
  return buildRewriteOptions(issue);
}

export function defaultRewriteId(issue: Issue | null | undefined): string {
  if (!issue) return '';
  const options = getRewriteOptions(issue);
  return (
    (options.find((option) => option.kind === 'REMOVE') ?? options[0])?.id ?? ''
  );
}

export function canApplyRewrite(option: RewriteOption | undefined): boolean {
  return option?.kind === 'REMOVE' || option?.kind === 'REPLACE';
}
