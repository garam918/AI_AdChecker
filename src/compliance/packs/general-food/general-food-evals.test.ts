import foodEvalCases from '@/evals/general-food/cases.json';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { detectGeneralFoodCategory } from './category-detector';
import { extractGeneralFoodClaimCandidates } from './claim-extractor';

const EvaluationCaseSchema = z.object({
  id: z.string(),
  group: z.enum(['HIGH_CANDIDATE', 'CONTEXT_DEPENDENT', 'SAFE_CONTEXT']),
  input: z.string(),
  expectedCategory: z.enum(['GENERAL_FOOD', 'GENERAL_ADVERTISING', 'UNKNOWN']),
  expectedRiskFamily: z.enum([
    'HIGH_CANDIDATE',
    'CONTEXT_DEPENDENT',
    'SAFE_CONTEXT',
  ]),
  expectedIssueTypes: z.array(z.string()),
  notes: z.string(),
});

const cases = z.array(EvaluationCaseSchema).length(30).parse(foodEvalCases);

describe('General Food evaluation dataset', () => {
  it('contains a balanced 10/10/10 candidate distribution', () => {
    expect(
      Object.fromEntries(
        ['HIGH_CANDIDATE', 'CONTEXT_DEPENDENT', 'SAFE_CONTEXT'].map((group) => [
          group,
          cases.filter((item) => item.group === group).length,
        ]),
      ),
    ).toEqual({
      HIGH_CANDIDATE: 10,
      CONTEXT_DEPENDENT: 10,
      SAFE_CONTEXT: 10,
    });
  });

  it.each(cases)('matches classification and candidates for $id', (item) => {
    const detection = detectGeneralFoodCategory({
      text: item.input,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
    const actualCategory =
      detection.disposition === 'MATCH'
        ? 'GENERAL_FOOD'
        : detection.disposition === 'UNCERTAIN'
          ? 'UNKNOWN'
          : 'GENERAL_ADVERTISING';
    expect(actualCategory).toBe(item.expectedCategory);

    const candidates =
      actualCategory === 'GENERAL_FOOD'
        ? extractGeneralFoodClaimCandidates(item.input)
        : [];
    const types = candidates.map((candidate) => candidate.claimType);
    item.expectedIssueTypes.forEach((issueType) => {
      expect(types).toContain(issueType);
    });

    if (item.expectedIssueTypes.length === 0) {
      expect(types).toEqual([]);
    }
    if (item.expectedRiskFamily === 'HIGH_CANDIDATE') {
      expect(
        candidates.some((candidate) => candidate.importance === 'HIGH'),
      ).toBe(true);
    }
  });
});
