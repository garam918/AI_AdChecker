import type {
  ComplianceAnalysisInput,
  ComplianceAnalyzer,
} from '@/src/compliance/core/compliance-analyzer';
import type { CompliancePackDefinition } from '@/src/compliance/core/compliance-pack';
import {
  ScanAnalysisResultSchema,
  type Issue,
  type RegulationSource,
  type ScanAnalysisResult,
  type Severity,
} from '@/src/compliance/core/schemas';
import { materializeClaims } from '@/src/compliance/packs/general-advertising/claim-extractor';
import { generalAdvertisingCompliancePack } from '@/src/compliance/packs/general-advertising/general-advertising-compliance-pack';
import { CitationValidator } from '@/src/compliance/regulatory/citation-validator';
import type {
  ProcessedRegulationLoader,
  RegulationRepository,
} from '@/src/compliance/regulatory/ingestion';
import { RegulatoryRetriever } from '@/src/compliance/regulatory/regulatory-retriever';
import type {
  RegulationChunk,
  RegulationDocument,
} from '@/src/compliance/regulatory/schemas';

import {
  ComplianceFindingSchema,
  type ComplianceReasoningProvider,
} from './providers/compliance-reasoning-provider';
type RagComplianceAnalyzerDependencies = {
  corpusLoader: ProcessedRegulationLoader;
  repository: RegulationRepository;
  reasoningProvider: ComplianceReasoningProvider;
  pack?: CompliancePackDefinition;
  includeDebug?: boolean;
};

export class RagComplianceAnalyzer implements ComplianceAnalyzer {
  private initialization: Promise<void> | null = null;
  private readonly retriever: RegulatoryRetriever;
  private readonly citationValidator: CitationValidator;
  private readonly pack: CompliancePackDefinition;

  constructor(
    private readonly dependencies: RagComplianceAnalyzerDependencies,
  ) {
    this.retriever = new RegulatoryRetriever(dependencies.repository);
    this.citationValidator = new CitationValidator(dependencies.repository);
    this.pack = dependencies.pack ?? generalAdvertisingCompliancePack;
  }

  async analyze(input: ComplianceAnalysisInput): Promise<ScanAnalysisResult> {
    const preparedInput =
      typeof input === 'string'
        ? {
            text: input,
            claims: this.pack.extractClaims({
              text: input,
              detectedContentType: 'ADVERTISEMENT_TEXT',
            }),
          }
        : input;
    const normalizedInput = preparedInput.text.trim();
    if (!normalizedInput) {
      throw new Error('분석할 광고 문구를 입력해 주세요.');
    }

    await this.initialize();

    const scanId = `scan-${this.pack.metadata.id.toLowerCase()}-${createStableId(normalizedInput)}`;
    const claims = materializeClaims(preparedInput.claims, scanId);
    const debug = {
      queries: [] as Array<{ claimId: string; query: string }>,
      retrieved: [] as Array<{
        claimId: string;
        chunkId: string;
        score: number;
      }>,
      selectedSourceChunkIds: [] as string[],
      rejectedCitations: [] as Array<{
        claimId: string;
        chunkId: string;
        reason: string;
      }>,
    };

    const reasoningItems = await Promise.all(
      claims.map(async (claim) => {
        const query = this.pack.buildRetrievalQuery(claim);
        const retrievalHits = await this.retriever.retrieve(query, {
          pack: this.pack.metadata.id,
          maxResults: 5,
          effectiveAt: new Date().toISOString().slice(0, 10),
          minimumScore: 0.08,
        });

        debug.queries.push({ claimId: claim.id, query });
        debug.retrieved.push(
          ...retrievalHits.map((hit) => ({
            claimId: claim.id,
            chunkId: hit.chunk.id,
            score: hit.score,
          })),
        );

        return {
          claim,
          query,
          retrievedChunks: retrievalHits.map((hit) => hit.chunk),
        };
      }),
    );

    const rawFindings = await this.dependencies.reasoningProvider.analyze({
      instructions: [...this.pack.analysisInstructions],
      productAuthorization: preparedInput.productAuthorization,
      items: reasoningItems,
    });
    const findings = rawFindings.map((finding) =>
      ComplianceFindingSchema.parse(finding),
    );
    assertFindingCoverage(
      claims.map((claim) => claim.id),
      findings.map((finding) => finding.claimId),
    );
    const sourceMap = new Map<string, RegulationSource>();
    const issues: Issue[] = [];

    for (const finding of findings) {
      const claim = claims.find(
        (candidate) => candidate.id === finding.claimId,
      );
      if (!claim) {
        throw new Error(
          '구조화 분석 결과가 존재하지 않는 claim을 참조했습니다.',
        );
      }

      const validation = await this.citationValidator.validate(
        finding.citationAssertions,
      );
      validation.rejected.forEach(({ assertion, reason }) => {
        debug.rejectedCitations.push({
          claimId: claim.id,
          chunkId: assertion.chunkId,
          reason,
        });
      });

      const verifiedChunkIds = validation.verified.map(({ chunk }) => chunk.id);
      validation.verified.forEach(({ chunk, document }) => {
        sourceMap.set(chunk.id, toRegulationSource(chunk, document));
      });
      debug.selectedSourceChunkIds.push(...verifiedChunkIds);

      const hasVerifiedCitation = verifiedChunkIds.length > 0;
      if (finding.disposition === 'PASS') continue;
      issues.push({
        id: `${scanId}-issue-${issues.length + 1}`,
        scanId,
        claimId: claim.id,
        packId: this.pack.metadata.id,
        severity: hasVerifiedCitation ? finding.severity : 'REVIEW_REQUIRED',
        category: finding.issueType,
        originalText: claim.text,
        explanation: finding.explanation,
        regulationSourceIds: verifiedChunkIds,
        sourceChunkIds: verifiedChunkIds,
        citationStatus: hasVerifiedCitation ? 'VERIFIED' : 'REVIEW_REQUIRED',
        uncertaintyReason: hasVerifiedCitation
          ? (finding.uncertaintyReason ?? null)
          : (finding.uncertaintyReason ??
            '검증된 공식 규정 출처를 연결하지 못해 추가 검토가 필요합니다.'),
        suggestedRewrites: finding.suggestedRewrites,
        requiredEvidence: finding.requiredEvidence,
        resolutionType: finding.resolutionType,
        similarEnforcementCaseIds: [],
      });
    }

    const deduplicatedIssues = deduplicateIssues(issues);

    return ScanAnalysisResultSchema.parse({
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: this.pack.metadata.category,
      overallRisk: calculateOverallRisk(deduplicatedIssues),
      claims,
      issues: deduplicatedIssues,
      sources: [...sourceMap.values()],
      activePacks: [this.pack.metadata.id],
      productAuthorization: preparedInput.productAuthorization,
      ...(this.dependencies.includeDebug && { debug }),
    });
  }

  private initialize() {
    if (!this.initialization) {
      this.initialization = this.dependencies.corpusLoader
        .load()
        .then(async ({ documents, chunks }) => {
          await this.dependencies.repository.saveDocuments(documents);
          await this.dependencies.repository.saveChunks(chunks);
        });
    }
    return this.initialization;
  }
}

function toRegulationSource(
  chunk: RegulationChunk,
  document: RegulationDocument,
): RegulationSource {
  const provision = [chunk.article, chunk.paragraph, chunk.section]
    .filter(Boolean)
    .join(' ');

  return {
    id: chunk.id,
    documentId: document.id,
    chunkId: chunk.id,
    title: document.title,
    shortTitle: document.shortTitle,
    authority: document.authority,
    sourceType: document.sourceType,
    effectiveDate: document.effectiveDate,
    article: chunk.article,
    paragraph: chunk.paragraph,
    section: chunk.section,
    heading: chunk.heading,
    provision: provision || null,
    text: chunk.text,
    sourceUrl: document.sourceUrl,
    citationStatus: 'VERIFIED',
    isDemoData: false,
  };
}

function deduplicateIssues(issues: Issue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.claimId}:${issue.category}:${issue.originalText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calculateOverallRisk(issues: Issue[]): Severity {
  if (issues.length === 0) return 'LOW';
  const priority: Severity[] = ['HIGH', 'MEDIUM', 'REVIEW_REQUIRED', 'LOW'];
  return priority.find((severity) =>
    issues.some((issue) => issue.severity === severity),
  )!;
}

function createStableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function assertFindingCoverage(claimIds: string[], findingClaimIds: string[]) {
  const expected = [...claimIds].sort();
  const actual = [...findingClaimIds].sort();
  if (
    expected.length !== actual.length ||
    expected.some((claimId, index) => claimId !== actual[index])
  ) {
    throw new Error(
      '구조화 분석 결과의 claim 참조가 추출된 claim 목록과 일치하지 않습니다.',
    );
  }
}
