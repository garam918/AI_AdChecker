import { describe, expect, it } from 'vitest';
import { getAnalysisCoverage } from './analysis-coverage';
import { ScanAnalysisResultSchema } from './schemas';

const report = {
  detectedContentType: 'ADVERTISEMENT_TEXT',
  detectedCategory: 'GENERAL_ADVERTISING',
  overallRisk: 'LOW',
  claims: [],
  issues: [],
  sources: [],
};

describe('analysis coverage and severity', () => {
  it.each([
    { metrics: { mode: 'offline', elapsedMs: 2, attempts: [] } },
    { analysisModel: 'rules-only' },
    {
      notices: [{ code: 'AI_UNAVAILABLE_RULES_ONLY', message: '문맥 미검토' }],
    },
    { notices: [{ code: 'CONTENT_TRUNCATED', message: '일부 구간 검사' }] },
    { notices: [{ code: 'AI_REVIEW_REQUIRED', message: '주장 추출 불완전' }] },
    { notices: [{ code: 'UNKNOWN_CATEGORY', message: '분류 확인 필요' }] },
  ])('never presents an incomplete no-hit result as LOW: %j', (partial) => {
    const parsed = ScanAnalysisResultSchema.parse({ ...report, ...partial });
    expect(parsed.overallRisk).toBe('REVIEW_REQUIRED');
    expect(getAnalysisCoverage(parsed).state).toBe('PARTIAL');
    // Parsing a stored record again must preserve the same classification.
    expect(ScanAnalysisResultSchema.parse(parsed)).toEqual(parsed);
  });

  it('preserves discovered high risk independently of incomplete coverage', () => {
    const parsed = ScanAnalysisResultSchema.parse({
      ...report,
      overallRisk: 'HIGH',
      analysisModel: 'rules-only',
    });
    expect(parsed.overallRisk).toBe('HIGH');
    expect(getAnalysisCoverage(parsed).state).toBe('PARTIAL');
  });

  it('does not equate every image caveat with failed extraction', () => {
    const parsed = ScanAnalysisResultSchema.parse({
      ...report,
      metrics: { mode: 'live', elapsedMs: 2, attempts: [] },
      notices: [
        { code: 'IMAGE_EXTRACTION_LIMITS', message: '원본과 대조하세요.' },
      ],
    });
    expect(parsed.overallRisk).toBe('LOW');
    expect(getAnalysisCoverage(parsed).state).toBe('COMPLETE');
  });

  it('marks incomplete images even if OCR and AI calls returned successfully', () => {
    const parsed = ScanAnalysisResultSchema.parse({
      ...report,
      inputType: 'IMAGE',
      metrics: { mode: 'live', elapsedMs: 2, attempts: [] },
      imageContent: {
        fileName: 'image.png',
        mimeType: 'image/png',
        extractedText: '문구',
        analysisText: '문구',
        visualObservations: [],
        incomplete: true,
      },
    });
    expect(parsed.overallRisk).toBe('REVIEW_REQUIRED');
    expect(getAnalysisCoverage(parsed).state).toBe('PARTIAL');
  });

  it('does not invent an AI completion trace for old reports', () => {
    expect(
      getAnalysisCoverage(ScanAnalysisResultSchema.parse(report)).state,
    ).toBe('UNVERIFIED');
  });
});
