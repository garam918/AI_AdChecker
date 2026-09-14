import {
  analysisResponse,
  AnalysisInputError,
  errorResponse,
  readAnalysisJson,
} from '@/src/server/analysis-response';
import { z } from 'zod';

import {
  AnalysisAudienceSchema,
  ScanAnalysisResultSchema,
} from '@/src/compliance/core/schemas';
import { ProductIdentitySchema } from '@/src/compliance/product-authorization/schemas';
import { contentComplianceScanService } from '@/src/server/regulatory-runtime';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  audience: AnalysisAudienceSchema.default('CONSUMER'),
  categoryHint: z
    .enum([
      'HEALTH_FUNCTIONAL_FOOD',
      'PHARMACEUTICAL',
      'MEDICAL_DEVICE',
      'COSMETIC',
    ])
    .optional(),
  productIdentity: ProductIdentitySchema.optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await readAnalysisJson(request));
    if (!parsed.success)
      throw new AnalysisInputError(
        '1자 이상 20,000자 이하의 광고 문구와 올바른 제품 정보를 입력해 주세요.',
      );
    const input = parsed.data;
    return analysisResponse(request, async (progress) => {
      const result = await contentComplianceScanService.analyzeContent(
        {
          text: input.text,
          detectedContentType: 'ADVERTISEMENT_TEXT',
          categoryHint: input.categoryHint,
          productIdentity: input.productIdentity,
        },
        progress,
      );
      return ScanAnalysisResultSchema.parse({
        ...result,
        audience: input.audience,
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
