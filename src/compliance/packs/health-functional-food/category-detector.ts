import type {
  PackCategoryDetection,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { affirmedExpressionMatches } from '@/src/compliance/core/affirmed-expressions';

const STRONG_IDENTITY_PATTERN =
  /건강\s*기능\s*식품|건기식|품목(?:제조)?(?:신고|보고)?번호|건강기능식품\s*(?:마크|도안)|기능성\s*원료/;
const AMBIGUOUS_SUPPLEMENT_PATTERN = /영양제|건강보조식품|보충제/;

export function detectHealthFunctionalFoodCategory(
  input: PackContentInput,
): PackCategoryDetection {
  if (input.categoryHint === 'HEALTH_FUNCTIONAL_FOOD') {
    return {
      category: 'HEALTH_FUNCTIONAL_FOOD',
      confidence: 1,
      disposition: 'MATCH',
      reasons: ['사용자가 제품 유형을 건강기능식품으로 지정했습니다.'],
    };
  }

  const structuredText = (input.webContent?.structuredData ?? [])
    .map((entry) => JSON.stringify(entry))
    .join(' ');
  const searchableText = `${input.text} ${structuredText}`;
  if (
    affirmedExpressionMatches(searchableText, STRONG_IDENTITY_PATTERN).length >
    0
  ) {
    return {
      category: 'HEALTH_FUNCTIONAL_FOOD',
      confidence: 0.99,
      disposition: 'MATCH',
      reasons: ['건강기능식품의 명시적 제품 정체성 신호를 확인했습니다.'],
    };
  }

  if (AMBIGUOUS_SUPPLEMENT_PATTERN.test(searchableText)) {
    return {
      category: 'UNKNOWN',
      confidence: 0.78,
      disposition: 'UNCERTAIN',
      reasons: [
        '영양제·보충제 표현만으로는 건강기능식품 품목 여부를 확정할 수 없습니다.',
      ],
    };
  }

  return {
    category: 'HEALTH_FUNCTIONAL_FOOD',
    confidence: 0,
    disposition: 'NO_MATCH',
    reasons: ['건강기능식품 정체성 신호를 확인하지 못했습니다.'],
  };
}
