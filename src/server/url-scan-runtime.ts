import { CachedWebContentExtractor } from '@/src/content/web/cached-web-content-extractor';
import { FixtureWebContentExtractor } from '@/src/content/web/fixture-web-content-extractor';
import { SafeHtmlFetcher } from '@/src/content/web/safe-html-fetcher';
import { SafeStaticWebContentExtractor } from '@/src/content/web/safe-static-web-content-extractor';
import { SemanticHtmlExtractor } from '@/src/content/web/semantic-html-extractor';
import { UrlComplianceScanService } from '@/src/content/web/url-compliance-scan-service';
import type { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import { CloudflareDnsResolver } from '@/src/security/cloudflare-dns-resolver';

import { contentComplianceScanService } from './regulatory-runtime';

const dnsResolver = new CloudflareDnsResolver();
const safeHtmlFetcher = new SafeHtmlFetcher(dnsResolver);
const semanticHtmlExtractor = new SemanticHtmlExtractor();
const staticWebContentExtractor = new SafeStaticWebContentExtractor(
  safeHtmlFetcher,
  semanticHtmlExtractor,
);
const cachedWebContentExtractor = new CachedWebContentExtractor(
  staticWebContentExtractor,
);

// The compliance stage is injectable so the per-request production stack can
// pass its AI + rules fallback chain while offline evaluations pass rules only.
export function createUrlComplianceScanService(
  complianceAnalyzer: Pick<
    ContentComplianceScanService,
    'analyzeContent'
  > = contentComplianceScanService,
) {
  return new UrlComplianceScanService(
    cachedWebContentExtractor,
    new FixtureWebContentExtractor(semanticHtmlExtractor),
    complianceAnalyzer,
    true,
  );
}

export const urlComplianceScanService = createUrlComplianceScanService();
