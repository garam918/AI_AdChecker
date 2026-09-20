import rawCases from '@/evals/end-to-end/cases.json';
import challengeCases from '@/evals/challenge/cases.json';
import validationCases from '@/evals/validation/cases.json';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createContentComplianceScanService } from '@/src/server/regulatory-runtime';

import {
  EvaluationDatasetSchema,
  evaluateCase,
  renderMarkdown,
  summarize,
} from './compliance-evaluation';

const cases = EvaluationDatasetSchema.parse(rawCases);
const service = createContentComplianceScanService();

describe('end-to-end evaluation dataset', () => {
  it('keeps the first validation set frozen and disjoint from development examples', () => {
    const validation = EvaluationDatasetSchema.parse(validationCases);
    expect(validation).toHaveLength(40);
    expect(validation.filter((item) => item.group === 'FLAG')).toHaveLength(24);
    const oldInputs = new Set(
      [...rawCases, ...challengeCases].map((item) => item.input),
    );
    expect(validation.every((item) => !oldInputs.has(item.input))).toBe(true);
    expect(
      createHash('sha256').update(JSON.stringify(validation)).digest('hex'),
    ).toBe('12337ce1d73ae2fcdae99c443f9112a24a5cd25fabc4ce298144dbe7a1b49fc6');
  });
  it('holds 30–50 unique cases across FLAG and SAFE groups for every pack', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(cases.length).toBeLessThanOrEqual(50);
    expect(
      cases.filter((item) => item.group === 'SAFE').length,
    ).toBeGreaterThanOrEqual(8);
    expect(new Set(cases.map((item) => item.pack))).toEqual(
      new Set([
        'GENERAL_ADVERTISING',
        'GENERAL_FOOD',
        'HEALTH_FUNCTIONAL_FOOD',
        'PHARMACEUTICAL',
        'MEDICAL_DEVICE',
        'COSMETIC',
      ]),
    );
    cases
      .filter((item) => item.group === 'SAFE')
      .forEach((item) => expect(item.expectedIssueTypes).toEqual([]));
  });

  it('keeps a separate synthetic challenge set without relabeling it as expert ground truth', () => {
    const challenge = EvaluationDatasetSchema.parse(challengeCases);
    expect(challenge).toHaveLength(40);
    expect(challenge.filter((item) => item.group === 'SAFE')).toHaveLength(16);
    expect(
      challenge.every((item) => !cases.some((old) => old.input === item.input)),
    ).toBe(true);
  });

  it('does not count SAFE execution errors as successful negatives or server time as user savings', async () => {
    const safe = cases.find((item) => item.group === 'SAFE')!;
    const failed = await evaluateCase(async () => {
      throw new Error('service unavailable');
    }, safe);
    const result = summarize([failed]);
    expect(result.completion).toEqual({ hit: 0, total: 1, rate: 0 });
    expect(result.falsePositives.total).toBe(0);
    expect(result.safeErrors).toEqual([safe.id]);
    expect(result.value.speedup).toBeNull();
  });

  it('measures displayed key issues separately from all findings and preserves review artifacts', async () => {
    const outcome = await evaluateCase(
      (input) => service.analyzeContent(input),
      cases[0]!,
    );
    expect(outcome.analysis?.issues.length).toBeGreaterThan(0);
    expect(outcome.humanReview?.status).toBe('PENDING');
    const result = summarize([{ ...outcome, issueCount: 9, keyIssueCount: 3 }]);
    expect(result.keyIssues.withinThree.rate).toBe(1);
    expect(result.keyIssues.maxIssues).toBe(9);
    expect(
      renderMarkdown(result, [outcome], {
        evaluatedAt: 'test',
        mode: 'live',
        model: null,
        dataset: 'challenge',
        datasetSha256: 'test',
        completed: false,
        expectedCases: 40,
      }),
    ).toContain('최종 수치 아님');
  });

  it('measures detection, source linking and false positives for the offline pipeline', async () => {
    const outcomes = [];
    for (const item of cases)
      outcomes.push(
        await evaluateCase((input) => service.analyzeContent(input), item),
      );
    const summary = summarize(outcomes, { baselineMinutes: 30 });

    expect(summary.errors).toBe(0);
    expect(summary.cases).toBe(cases.length);
    // Regression floor for the deterministic pipeline on this dataset.
    expect(summary.detection.rate).toBeGreaterThanOrEqual(0.9);
    expect(summary.sourceLink.rate).toBe(1);
    expect(summary.falsePositives.ids).toEqual([]);
    expect(summary.categoryAccuracy.rate).toBe(1);
    expect(summary.keyIssues.maxIssues).toBeLessThanOrEqual(4);
    expect(summary.value.baselineIsAssumption).toBe(true);
    expect(summary.latency.medianMs).not.toBeNull();

    const markdown = renderMarkdown(summary, outcomes, {
      evaluatedAt: '2026-09-14T00:00:00.000Z',
      mode: 'offline',
      model: 'rules-only',
    });
    expect(markdown).toContain('탐지 성공률');
    expect(markdown).toContain('가정값');
  });
});
