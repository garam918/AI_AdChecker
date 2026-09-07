import type { Claim, ScanAnalysisResult } from './schemas';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';

export type PreparedClaim = Omit<Claim, 'id' | 'scanId'>;

export type ComplianceAnalysisInput =
  | string
  | {
      text: string;
      claims: PreparedClaim[];
      productAuthorization?: ProductAuthorizationResolution;
    };

export interface ComplianceAnalyzer {
  analyze(input: ComplianceAnalysisInput): Promise<ScanAnalysisResult>;
}
