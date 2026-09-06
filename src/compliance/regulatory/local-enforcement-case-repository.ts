import generalFoodCaseCorpus from '@/data/enforcement-cases/general-food.official.json';

import {
  EnforcementCaseCorpusSchema,
  type EnforcementCase,
} from './enforcement-case-schemas';
import type { CompliancePackId } from './schemas';

export interface EnforcementCaseRepository {
  findRelevantCases(
    pack: CompliancePackId,
    issueType: string,
  ): Promise<EnforcementCase[]>;
}

export class LocalEnforcementCaseRepository implements EnforcementCaseRepository {
  private readonly cases = EnforcementCaseCorpusSchema.parse(
    generalFoodCaseCorpus,
  ).cases;

  async findRelevantCases(pack: CompliancePackId, issueType: string) {
    return this.cases
      .filter(
        (enforcementCase) =>
          enforcementCase.pack === pack &&
          enforcementCase.issueType === issueType,
      )
      .slice(0, 2);
  }
}
