import type { Claim, ScanAnalysisResult } from './schemas';

export type PreparedClaim = Omit<Claim, 'id' | 'scanId'>;

export type ComplianceAnalysisInput =
  | string
  | {
      text: string;
      claims: PreparedClaim[];
    };

export interface ComplianceAnalyzer {
  analyze(input: ComplianceAnalysisInput): Promise<ScanAnalysisResult>;
}
