import demoHtml from '@/data/web-fixtures/ai-saas-landing.html?raw';
import { describe, expect, it } from 'vitest';

import { SemanticHtmlExtractor } from './semantic-html-extractor';

describe('SemanticHtmlExtractor', () => {
  it('extracts prioritized landing-page sections and supported JSON-LD', () => {
    const content = new SemanticHtmlExtractor().extract({
      html: demoHtml,
      url: 'https://example.com',
      finalUrl: 'https://example.com/product',
    });

    expect(content.title).toBe('ContentFlow AI — 업무 자동화');
    expect(content.language).toBe('ko');
    expect(content.sections.some((section) => section.type === 'HERO')).toBe(
      true,
    );
    expect(content.sections.some((section) => section.type === 'PRICING')).toBe(
      true,
    );
    expect(
      content.sections.some(
        (section) =>
          section.type === 'CTA' && section.text === '지금 무료로 시작하기',
      ),
    ).toBe(true);
    expect(content.structuredData).toHaveLength(1);
    expect(content.images).toContainEqual({
      alt: 'AI 자동 보고서 화면',
      src: 'https://example.com/assets/report.png',
    });
  });

  it('removes navigation, hidden content, tracking pixels and duplicates', () => {
    const content = new SemanticHtmlExtractor().extract({
      html: `${demoHtml}<main><p>중복 문구</p><p>중복 문구</p></main>`,
      url: 'https://example.com',
      finalUrl: 'https://example.com',
    });

    expect(content.visibleText).not.toContain('국내 최고의 숨겨진 추적 문구');
    expect(content.visibleText).not.toContain('홈 기능 요금 홈 기능 요금');
    expect(content.images.some((image) => image.alt === 'tracking')).toBe(
      false,
    );
    expect(
      content.sections.filter((section) => section.text === '중복 문구'),
    ).toHaveLength(1);
  });

  it('marks content trimmed by section priority', () => {
    const content = new SemanticHtmlExtractor(80).extract({
      html: demoHtml,
      url: 'https://example.com',
      finalUrl: 'https://example.com',
    });

    expect(content.contentTruncated).toBe(true);
    expect(content.visibleText.length).toBeLessThanOrEqual(80);
  });
});
