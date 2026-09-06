import { z } from 'zod';

import { contentComplianceScanService } from '@/src/server/regulatory-runtime';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const result = await contentComplianceScanService.analyze(input.text);
    return Response.json(result);
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
