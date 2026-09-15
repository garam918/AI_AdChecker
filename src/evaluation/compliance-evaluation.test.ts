import rawCases from '@/evals/end-to-end/cases.json';
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
