import { z } from 'zod';

import {
  AnalysisAudienceSchema,
  ScanAnalysisResultSchema,
} from '@/src/compliance/core/schemas';
import { ProductIdentitySchema } from '@/src/compliance/product-authorization/schemas';
import { contentComplianceScanService } from '@/src/server/regulatory-runtime';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
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
    const input = RequestSchema.parse(await request.json());
    const result = await contentComplianceScanService.analyzeContent({
      text: input.text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: input.categoryHint,
      productIdentity: input.productIdentity,
    });
    return Response.json(
      ScanAnalysisResultSchema.parse({ ...result, audience: input.audience }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { message: '1자 이상 2,000자 이하의 광고 문구를 입력해 주세요.' },
        { status: 400 },
      );
    }

    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : '분석 중 오류가 발생했습니다. 결과를 생성하지 않았습니다.',
      },
      { status: 500 },
    );
  }
}
