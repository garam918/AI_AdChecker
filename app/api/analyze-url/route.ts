import { z } from 'zod';

import {
  AnalysisAudienceSchema,
  ScanAnalysisResultSchema,
} from '@/src/compliance/core/schemas';
import { ProductIdentitySchema } from '@/src/compliance/product-authorization/schemas';
import { DEMO_FIXTURE_IDS } from '@/src/content/web/fixture-web-content-extractor';
import { WebExtractionError } from '@/src/content/web/web-extraction-error';
import {
  UnsafeUrlError,
  validatePublicHttpUrl,
} from '@/src/security/url-validator';
import { urlComplianceScanService } from '@/src/server/url-scan-runtime';

const RequestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048).optional(),
    fixtureId: z.enum(DEMO_FIXTURE_IDS).optional(),
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
  })
  .refine((input) => Boolean(input.url) !== Boolean(input.fixtureId), {
    message: 'URL 또는 demo fixture 하나만 지정해야 합니다.',
  });

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    if (input.url) {
      const url = validatePublicHttpUrl(input.url);
      return Response.json(
        ScanAnalysisResultSchema.parse({
          ...(await urlComplianceScanService.analyze({
            url: url.toString(),
            categoryHint: input.categoryHint,
            productIdentity: input.productIdentity,
          })),
          audience: input.audience,
        }),
      );
    }
    return Response.json(
      ScanAnalysisResultSchema.parse({
        ...(await urlComplianceScanService.analyze({
          fixtureId: input.fixtureId!,
          categoryHint: input.categoryHint,
          productIdentity: input.productIdentity,
        })),
        audience: input.audience,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof UnsafeUrlError) {
      return Response.json(
        {
          code: 'INVALID_INPUT',
          message:
            error instanceof UnsafeUrlError
              ? error.message
              : '올바른 URL을 입력해 주세요.',
        },
        { status: 400 },
      );
    }
    if (error instanceof WebExtractionError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.httpStatus },
      );
    }
    return Response.json(
      {
        code: 'ANALYSIS_FAILED',
        message:
          error instanceof Error
            ? error.message
            : '웹페이지 분석 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
