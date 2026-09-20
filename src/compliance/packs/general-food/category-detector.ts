import type {
  PackCategoryDetection,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';
import { affirmedExpressionMatches } from '@/src/compliance/core/affirmed-expressions';

const FOOD_IDENTITY_PATTERNS = [
  /일반\s*식품|가공식품|식품\s*유형|원재료|영양정보|섭취/,
  /음료|(?:^|[\s·,/])차(?:[\s·,/]|$)|보리차|녹차|홍차|커피|과자|스낵|분말|티백|효소식품|단백질\s*식품/,
  /(?:한|두|세|\d+)\s*잔|구수한?\s*맛|무가당/,
];
const EXCLUDED_PRODUCT_PATTERN =
  /건강기능식품|건기식|일반의약품|전문의약품|의약품|의료기기|화장품|특수의료용도식품|영양제/;
const SOFTWARE_PATTERN = /saas|소프트웨어|앱|서비스|솔루션|플랫폼|api|ai/i;
const HEALTH_CLAIM_PATTERN =
  /혈당|면역력|체지방|관절|피부|감기|당뇨|아토피|고혈압|질병|치료|예방/;

export function detectGeneralFoodCategory(
  input: PackContentInput,
): PackCategoryDetection {
  const structuredText = (input.webContent?.structuredData ?? [])
    .map((entry) => JSON.stringify(entry))
    .join(' ');
  const searchableText = `${input.text} ${structuredText}`;
  const identitySignals = FOOD_IDENTITY_PATTERNS.filter((pattern) =>
    pattern.test(searchableText),
  ).length;
  const hasSoftwareSignal = SOFTWARE_PATTERN.test(searchableText);
  const hasExcludedProduct =
    affirmedExpressionMatches(searchableText, EXCLUDED_PRODUCT_PATTERN).length >
    0;
  const hasHealthClaim = HEALTH_CLAIM_PATTERN.test(searchableText);

  if (hasSoftwareSignal && identitySignals === 0) {
    return {
      category: 'GENERAL_FOOD',
      confidence: 0,
      disposition: 'NO_MATCH',
      reasons: ['소프트웨어·서비스 신호가 있고 식품 정체성 신호가 없습니다.'],
    };
  }

  if (hasExcludedProduct) {
    return {
      category: 'UNKNOWN',
      confidence: 0.96,
      disposition: 'UNCERTAIN',
      reasons: ['일반식품과 다른 규제 제품 유형 신호가 있습니다.'],
    };
  }

  if (identitySignals > 0) {
    return {
      category: 'GENERAL_FOOD',
      confidence: Math.min(0.96, 0.72 + identitySignals * 0.08),
      disposition: 'MATCH',
      reasons: [`일반식품 정체성 신호 ${identitySignals}개를 확인했습니다.`],
    };
  }

  if (hasHealthClaim) {
    return {
      category: 'UNKNOWN',
      confidence: 0.7,
      disposition: 'UNCERTAIN',
      reasons: [
        '건강 효익 표현은 있지만 일반식품 정체성을 확인하지 못했습니다.',
      ],
    };
  }

  return {
    category: 'GENERAL_FOOD',
    confidence: 0,
    disposition: 'NO_MATCH',
    reasons: ['일반식품 신호를 확인하지 못했습니다.'],
  };
}
