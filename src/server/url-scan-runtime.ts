import { CachedWebContentExtractor } from '@/src/content/web/cached-web-content-extractor';
import { FixtureWebContentExtractor } from '@/src/content/web/fixture-web-content-extractor';
import { SafeHtmlFetcher } from '@/src/content/web/safe-html-fetcher';
import { SafeStaticWebContentExtractor } from '@/src/content/web/safe-static-web-content-extractor';
import { SemanticHtmlExtractor } from '@/src/content/web/semantic-html-extractor';
import { UrlComplianceScanService } from '@/src/content/web/url-compliance-scan-service';
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

export const urlComplianceScanService = new UrlComplianceScanService(
  cachedWebContentExtractor,
  new FixtureWebContentExtractor(semanticHtmlExtractor),
  contentComplianceScanService,
);
