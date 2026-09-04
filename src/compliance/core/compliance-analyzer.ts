import type { ScanAnalysisResult } from './schemas';

export interface ComplianceAnalyzer {
  analyze(input: string): Promise<ScanAnalysisResult>;
}
