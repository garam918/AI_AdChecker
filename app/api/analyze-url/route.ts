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
import { DEMO_FIXTURE_IDS } from '@/src/content/web/fixture-web-content-extractor';
import { validatePublicHttpUrl } from '@/src/security/url-validator';
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
    const parsed = RequestSchema.safeParse(await readAnalysisJson(request));
    if (!parsed.success)
      throw new AnalysisInputError(
        '올바른 웹페이지 URL과 제품 정보를 입력해 주세요.',
      );
    const input = parsed.data;
    const url = input.url ? validatePublicHttpUrl(input.url) : undefined;
    if (
      url &&
      /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(url.hostname)
    ) {
      throw new AnalysisInputError(
        'YouTube 분석은 이번 지원 범위에 포함되지 않습니다. 광고 텍스트나 이미지를 입력해 주세요.',
      );
    }
    return analysisResponse(request, async (progress) =>
      ScanAnalysisResultSchema.parse({
        ...(await urlComplianceScanService.analyze(
          {
            ...(url
              ? { url: url.toString() }
              : { fixtureId: input.fixtureId! }),
            categoryHint: input.categoryHint,
            productIdentity: input.productIdentity,
          },
          progress,
        )),
        audience: input.audience,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
