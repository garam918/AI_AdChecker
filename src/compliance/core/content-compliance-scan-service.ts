import type {
  ComplianceAnalysisInput,
  ComplianceAnalyzer,
} from './compliance-analyzer';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from './compliance-pack';
import { CompliancePackRouter } from './compliance-pack-router';
import {
  ScanAnalysisResultSchema,
  type Issue,
  type ScanAnalysisResult,
  type Severity,
} from './schemas';
import type { EnforcementCase } from '@/src/compliance/regulatory/enforcement-case-schemas';
import type { EnforcementCaseRepository } from '@/src/compliance/regulatory/local-enforcement-case-repository';

export type PackAnalyzerRegistration = {
  pack: CompliancePackDefinition;
  analyzer: ComplianceAnalyzer;
};

export class ContentComplianceScanService implements ComplianceAnalyzer {
  private readonly router: CompliancePackRouter;

  constructor(
    private readonly registrations: readonly PackAnalyzerRegistration[],
    private readonly enforcementCaseRepository?: EnforcementCaseRepository,
  ) {
    this.router = new CompliancePackRouter(
      registrations.map((registration) => registration.pack),
    );
  }

  async analyze(input: ComplianceAnalysisInput) {
    const text = typeof input === 'string' ? input : input.text;
    return this.analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
  }

  async analyzeContent(input: PackContentInput): Promise<ScanAnalysisResult> {
    const normalizedText = input.text.trim();
    if (!normalizedText) throw new Error('분석할 광고 문구를 입력해 주세요.');

    const routed = this.router.route({ ...input, text: normalizedText });
    if (routed.detectedCategory === 'UNKNOWN') {
      return ScanAnalysisResultSchema.parse({
        detectedContentType: input.detectedContentType,
        detectedCategory: 'UNKNOWN',
        overallRisk: 'REVIEW_REQUIRED',
        claims: [],
        issues: [],
        sources: [],
        activePacks: [],
        notices: [
          {
            code: 'UNKNOWN_CATEGORY',
            message:
              '제품 유형을 지원 범위 안에서 확정하지 못했습니다. 제품 분류를 확인해 주세요.',
          },
        ],
      });
    }

    const results = await Promise.all(
      routed.activePacks.map(async (pack) => {
        const registration = this.registrations.find(
          (candidate) => candidate.pack.metadata.id === pack.metadata.id,
        );
        if (!registration) {
          throw new Error(
            `${pack.metadata.id} analyzer가 등록되지 않았습니다.`,
          );
        }
        const claims = pack.extractClaims(input);
        return registration.analyzer.analyze({ text: normalizedText, claims });
      }),
    );

    return this.mergeResults(input, routed.detectedCategory, results);
  }

  private async mergeResults(
    input: PackContentInput,
    detectedCategory: ScanAnalysisResult['detectedCategory'],
    results: ScanAnalysisResult[],
  ) {
    const issues = deduplicateIssues(
      results.flatMap((result) => result.issues),
    );
    const enforcementCases: EnforcementCase[] = [];

    if (this.enforcementCaseRepository) {
      for (const issue of issues) {
        const matches = await this.enforcementCaseRepository.findRelevantCases(
          issue.packId,
          issue.category,
        );
        issue.similarEnforcementCaseIds = matches.map((match) => match.id);
        enforcementCases.push(...matches);
      }
    }

    const uniqueSources = uniqueBy(
      results.flatMap((result) => result.sources),
      (source) => source.id,
    );
    const uniqueCases = uniqueBy(enforcementCases, (item) => item.id);
    const debugResults = results
      .map((result) => result.debug)
      .filter((debug): debug is NonNullable<ScanAnalysisResult['debug']> =>
        Boolean(debug),
      );

    return ScanAnalysisResultSchema.parse({
      detectedContentType: input.detectedContentType,
      detectedCategory,
      overallRisk: calculateOverallRisk(issues),
      claims: results.flatMap((result) => result.claims),
      issues,
      sources: uniqueSources,
      enforcementCases: uniqueCases,
      activePacks: unique(results.flatMap((result) => result.activePacks)),
      ...(debugResults.length > 0 && {
        debug: {
          queries: debugResults.flatMap((debug) => debug.queries),
          retrieved: debugResults.flatMap((debug) => debug.retrieved),
          selectedSourceChunkIds: debugResults.flatMap(
            (debug) => debug.selectedSourceChunkIds,
          ),
          rejectedCitations: debugResults.flatMap(
            (debug) => debug.rejectedCitations,
          ),
        },
      }),
    });
  }
}

export function deduplicateIssues(issues: Issue[]) {
  const merged = new Map<string, Issue>();
  issues.forEach((issue) => {
    const key = [
      issue.category,
      normalize(issue.originalText),
      [...issue.sourceChunkIds].sort().join(','),
    ].join(':');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...issue });
      return;
    }
    merged.set(key, {
      ...existing,
      severity: higherSeverity(existing.severity, issue.severity),
      requiredEvidence: unique([
        ...existing.requiredEvidence,
        ...issue.requiredEvidence,
      ]),
      suggestedRewrites: unique([
        ...existing.suggestedRewrites,
        ...issue.suggestedRewrites,
      ]),
      similarEnforcementCaseIds: unique([
        ...existing.similarEnforcementCaseIds,
        ...issue.similarEnforcementCaseIds,
      ]),
    });
  });
  return [...merged.values()];
}

function calculateOverallRisk(issues: Issue[]): Severity {
  if (issues.length === 0) return 'LOW';
  return ['HIGH', 'MEDIUM', 'REVIEW_REQUIRED', 'LOW'].find((severity) =>
    issues.some((issue) => issue.severity === severity),
  ) as Severity;
}

function higherSeverity(left: Severity, right: Severity) {
  const order: Severity[] = ['LOW', 'REVIEW_REQUIRED', 'MEDIUM', 'HIGH'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function normalize(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string) {
  const result = new Map<string, T>();
  values.forEach((value) => result.set(keyFor(value), value));
  return [...result.values()];
}
