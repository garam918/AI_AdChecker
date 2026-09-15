import type { Issue, Severity } from './schemas';

export const KEY_ISSUE_LIMIT = 3;

const SEVERITY_RANK: Record<Severity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  REVIEW_REQUIRED: 1,
  LOW: 0,
};

/**
 * Collapses issues that flag the same expression for the same reason.
 *
 * Rule extractors and the AI often quote nested spans of one sentence
 * ("70% 줄여주는" inside "업무 시간을 70% 줄여주는"). When two issues share a
 * pack and category and one quote contains the other, keep a single issue
 * with the longer quote, the higher severity and the union of sources,
 * evidence and rewrites. A verified citation always wins over an unverified one.
 */
export function consolidateIssues(issues: Issue[]): Issue[] {
  const result: Issue[] = [];
  for (const issue of issues) {
    const index = result.findIndex(
      (other) =>
        other.packId === issue.packId &&
        other.category === issue.category &&
        contains(other.originalText, issue.originalText),
    );
    if (index < 0) {
      result.push({ ...issue });
      continue;
    }
    result[index] = mergeIssue(result[index], issue);
  }
  return result;
}

/**
 * Orders issues so the most actionable come first: severity, then verified
 * citation, then original position in the text. Stable for equal keys.
 */
export function rankIssues(issues: Issue[]): Issue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((left, right) => {
      const severity =
        SEVERITY_RANK[right.issue.severity] -
        SEVERITY_RANK[left.issue.severity];
      if (severity !== 0) return severity;
      const verified =
        Number(right.issue.citationStatus === 'VERIFIED') -
        Number(left.issue.citationStatus === 'VERIFIED');
      if (verified !== 0) return verified;
      return left.index - right.index;
    })
    .map(({ issue }) => issue);
}

/**
 * Picks the 2–3 issues a marketer should read first.
 *
 * Takes ranked issues and prefers one issue per (pack, category) so the
 * summary covers distinct problems rather than three variants of one; fills
 * remaining slots by rank. Returns issue ids in display order.
 */
export function selectKeyIssueIds(
  rankedIssues: Issue[],
  limit = KEY_ISSUE_LIMIT,
): string[] {
  const seenCategories = new Set<string>();
  const selected: Issue[] = [];
  for (const issue of rankedIssues) {
    const key = `${issue.packId}:${issue.category}`;
    if (seenCategories.has(key)) continue;
    seenCategories.add(key);
    selected.push(issue);
    if (selected.length === limit) break;
  }
  for (const issue of rankedIssues) {
    if (selected.length === limit) break;
    if (!selected.includes(issue)) selected.push(issue);
  }
  return rankedIssues
    .filter((issue) => selected.includes(issue))
    .map((issue) => issue.id);
}

function mergeIssue(existing: Issue, incoming: Issue): Issue {
  const preferIncoming =
    (incoming.citationStatus === 'VERIFIED' &&
      existing.citationStatus !== 'VERIFIED') ||
    (incoming.citationStatus === existing.citationStatus &&
      SEVERITY_RANK[incoming.severity] > SEVERITY_RANK[existing.severity]);
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;
  const longerText =
    normalize(existing.originalText).length >=
    normalize(incoming.originalText).length
      ? existing.originalText
      : incoming.originalText;
  return {
    ...primary,
    id: existing.id,
    originalText: longerText,
    severity:
      SEVERITY_RANK[existing.severity] >= SEVERITY_RANK[incoming.severity]
        ? existing.severity
        : incoming.severity,
    regulationSourceIds: unique([
      ...primary.regulationSourceIds,
      ...secondary.regulationSourceIds,
    ]),
    sourceChunkIds: unique([
      ...primary.sourceChunkIds,
      ...secondary.sourceChunkIds,
    ]),
    requiredEvidence: unique([
      ...primary.requiredEvidence,
      ...secondary.requiredEvidence,
    ]),
    suggestedRewrites: unique([
      ...primary.suggestedRewrites,
      ...secondary.suggestedRewrites,
    ]),
    similarEnforcementCaseIds: unique([
      ...primary.similarEnforcementCaseIds,
      ...secondary.similarEnforcementCaseIds,
    ]),
  };
}

function contains(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  return a.includes(b) || b.includes(a);
}

function normalize(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}
