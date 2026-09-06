import { z } from 'zod';

import { AI_SAAS_DEMO_FIXTURE_ID } from '@/src/content/web/fixture-web-content-extractor';
import { WebExtractionError } from '@/src/content/web/web-extraction-error';
import {
  UnsafeUrlError,
  validatePublicHttpUrl,
} from '@/src/security/url-validator';
import { urlComplianceScanService } from '@/src/server/url-scan-runtime';

const RequestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048).optional(),
    fixtureId: z.literal(AI_SAAS_DEMO_FIXTURE_ID).optional(),
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
        await urlComplianceScanService.analyze({ url: url.toString() }),
      );
    }
    return Response.json(
      await urlComplianceScanService.analyze({
        fixtureId: input.fixtureId!,
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
