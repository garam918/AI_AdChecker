import { describe, expect, it } from 'vitest';

import { classifyWebContent } from './content-classifier';
import { SemanticHtmlExtractor } from './semantic-html-extractor';

function extract(html: string) {
  return new SemanticHtmlExtractor().extract({
    html,
    url: 'https://example.com',
    finalUrl: 'https://example.com',
  });
}

describe('classifyWebContent', () => {
  it('classifies a software application as a general-ad landing page', () => {
    const content = extract(`
      <html><head><title>업무 자동화 AI</title>
      <script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
      </head><body><main class="hero"><h1>팀의 반복 업무를 줄이세요</h1></main></body></html>
    `);

    expect(classifyWebContent(content)).toEqual({
      detectedContentType: 'LANDING_PAGE',
      detectedCategory: 'GENERAL_ADVERTISING',
    });
  });

  it('classifies food marketing separately from general advertising', () => {
    const content = extract(`
      <html><head><title>건강 음료</title></head>
      <body><main class="hero"><h1>매일 한 잔으로 혈당 관리와 면역력 개선</h1></main></body></html>
    `);

    expect(classifyWebContent(content)).toEqual({
      detectedContentType: 'LANDING_PAGE',
      detectedCategory: 'GENERAL_FOOD',
    });
  });

  it('does not apply a supported advertising category to documentation', () => {
    const content = extract(`
      <html><head><title>API Reference</title></head>
      <body><main><h1>Developer Documentation</h1><p>요청 규격을 설명합니다.</p></main></body></html>
    `);

    expect(classifyWebContent(content)).toEqual({
      detectedContentType: 'DOCUMENTATION',
      detectedCategory: 'UNKNOWN',
    });
  });
});
