import { z } from 'zod';
import { AnalysisAudienceSchema } from '@/src/compliance/core/schemas';
import { ProductIdentitySchema } from '@/src/compliance/product-authorization/schemas';
import {
  ImageComplianceScanService,
  MAX_IMAGE_BYTES,
} from '@/src/content/image/image-compliance-scan-service';
import {
  contentComplianceScanService,
  geminiContentProvider,
} from '@/src/server/regulatory-runtime';
import {
  analysisResponse,
  AnalysisInputError,
  errorResponse,
  readLimitedBody,
} from '@/src/server/analysis-response';

const OptionsSchema = z.object({
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

const service = new ImageComplianceScanService(
  geminiContentProvider,
  contentComplianceScanService,
);

export async function POST(request: Request) {
  try {
    if (
      !request.headers.get('content-type')?.startsWith('multipart/form-data;')
    )
      throw new AnalysisInputError('이미지 업로드 형식이 올바르지 않습니다.');
    const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES + 64_000);
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { 'content-type': request.headers.get('content-type')! },
      }).formData();
    } catch {
      throw new AnalysisInputError('이미지 업로드 내용을 읽지 못했습니다.');
    }
    const file = form.get('image');
    if (!file || typeof file === 'string' || form.getAll('image').length !== 1)
      throw new AnalysisInputError('이미지 한 장을 선택해 주세요.');
    let rawOptions: unknown;
    try {
      const optionsValue = form.get('options') ?? '{}';
      if (typeof optionsValue !== 'string')
        throw new Error('Expected text options');
      rawOptions = JSON.parse(optionsValue);
    } catch {
      throw new AnalysisInputError('제품 정보 형식이 올바르지 않습니다.');
    }
    const options = OptionsSchema.safeParse(rawOptions);
    if (!options.success)
      throw new AnalysisInputError('제품 유형과 검사 목적을 확인해 주세요.');
    return analysisResponse(request, async (progress) => ({
      ...(await service.analyze(file, options.data, progress)),
      audience: options.data.audience,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
