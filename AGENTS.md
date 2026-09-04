# AGENTS.md

## 1. Project Overview

This project is an AI-powered web application tentatively named `ContentLint AI`.

ContentLint AI analyzes marketing and promotional content before publication and identifies potential compliance risks under Korean advertising-related regulations.

The core product concept is:

> "Lint for content before publish."

Just as developers run a linter before shipping code, creators and marketers should be able to run a compliance lint before publishing content.

The application must NOT present itself as legal advice or make definitive legal judgments.

It is a pre-screening and risk detection tool.

---

# 2. Product Goal

The MVP must allow users to analyze:

1. Website / landing page URL
2. Product detail page URL
3. Advertising text
4. YouTube URL
5. Image upload
6. Video upload when technically feasible

The MVP initially supports these domains:

### A. General Advertising

Examples:

- IT services
- SaaS
- AI products
- general consumer products

Primary concerns:

- misleading claims
- unverifiable numerical claims
- superiority claims
- comparative advertising
- evidence requirements

### B. General Food

Primary concerns:

- disease prevention/treatment claims
- pharmaceutical-like representations
- health-functional-food-like representations
- exaggerated health effects

### C. Influencer / Sponsored Content

Primary concerns:

- economic-interest disclosure
- advertising disclosure
- endorsement language
- product-specific advertising regulations

Do NOT expand the MVP to cosmetics, pharmaceuticals, medical devices, finance, insurance, real estate, or other regulated industries unless explicitly requested.

---

# 3. Product Principles

Always follow these principles.

### 3.1 Never claim definitive legality

Forbidden UI wording:

- "This advertisement is illegal."
- "This advertisement will pass review."
- "Violation confirmed."
- "100% compliant."

Preferred wording:

- HIGH RISK
- MEDIUM RISK
- LOW RISK
- REVIEW REQUIRED
- Potential compliance risk
- Additional verification recommended

---

### 3.2 Every AI finding must have a source

An AI-generated issue cannot be presented as a valid finding unless it is connected to a retrieved regulatory source.

Every issue should contain:

- issue id
- severity
- original content
- explanation
- source id
- law/regulation title
- provision/article if available
- source URL if available
- suggested rewrite
- required evidence if applicable

Never invent an article number.

If the model provides a legal citation that cannot be verified against the retrieval corpus, discard the citation or downgrade the item to REVIEW REQUIRED.

---

### 3.3 Separate deterministic rules from AI reasoning

Do NOT use an LLM for everything.

Use three analysis layers.

#### Layer 1: Deterministic Rules

Use for:

- explicit prohibited phrases
- disclosure pattern detection
- missing required labels
- known numerical/pattern-based conditions
- URL/content type classification where deterministic logic is sufficient

#### Layer 2: Regulatory Retrieval

Use RAG to retrieve relevant:

- laws
- enforcement decrees
- administrative rules
- official guidelines
- official enforcement examples

Retrieval must return structured source metadata.

#### Layer 3: AI Reasoning

Use LLM reasoning for:

- contextual interpretation
- claim extraction
- implied claims
- misleading context
- relation between advertisement and evidence
- suggested safer rewrite

---

# 4. AI Analysis Pipeline

Use this conceptual pipeline:

Input
→ Content Extraction
→ Content Classification
→ Claim Extraction
→ Compliance Pack Selection
→ Deterministic Rule Analysis
→ Regulatory Retrieval
→ AI Risk Analysis
→ Citation Validation
→ Issue Deduplication
→ Severity Calculation
→ Rewrite Generation
→ Structured Report

For video:

YouTube URL
→ Metadata
→ Transcript
→ Description
→ Sampled Video Frames
→ OCR / visual understanding
→ Timeline Events
→ Claims
→ Compliance Analysis

The system must preserve timestamps for video-derived findings.

---

# 5. Compliance Pack Architecture

Regulations must be modular.

Recommended structure:

src/
compliance/
core/
packs/
general-advertising/
general-food/
influencer/

Each compliance pack should conceptually contain:

- metadata
- supported content types
- regulatory sources
- deterministic rules
- retrieval configuration
- analysis instructions
- evaluation cases

Future packs should be addable without rewriting the core analysis engine.

Do not hard-code category-specific behavior inside unrelated application layers.

---

# 6. Source Hierarchy

Prefer sources in this order:

1. 국가법령정보센터
2. 공정거래위원회
3. 식품의약품안전처
4. other Korean government agencies
5. officially recognized self-regulatory organizations

Avoid:

- blogs
- law firm marketing articles
- anonymous web content
- AI-generated summaries
- community posts

Secondary sources may be used only for discovery, never as the final legal authority if an official source is available.

---

# 7. Retrieval Data Model

A regulatory source should support at least:

RegulationDocument

- id
- title
- authority
- sourceType
- effectiveDate
- sourceUrl
- updatedAt

RegulationChunk

- id
- documentId
- article
- section
- text
- embedding
- metadata

All citations returned to the frontend should reference persisted source IDs rather than raw model text.

---

# 8. Scan Domain Model

Use a model similar to:

Scan

- id
- inputType
- inputUrl
- title
- detectedContentType
- detectedCategory
- status
- overallRisk
- createdAt
- completedAt

Claim

- id
- scanId
- text
- startOffset
- endOffset
- timestamp
- claimType

Issue

- id
- scanId
- claimId
- severity
- category
- originalText
- explanation
- regulationSourceIds
- suggestedRewrites
- requiredEvidence
- startTimestamp
- endTimestamp

SourceCitation

- id
- regulationDocumentId
- regulationChunkId
- title
- provision
- url

---

# 9. Severity Model

Only use:

LOW
MEDIUM
HIGH
REVIEW_REQUIRED

Avoid fake probability values such as:

"83% illegal"
"92% chance of rejection"

unless a properly calibrated model and benchmark exist.

Severity must be explainable.

Example factors:

HIGH:

- explicit prohibited expression
- direct conflict with regulation
- highly specific objective claim without evidence
- missing mandatory sponsorship disclosure

MEDIUM:

- potentially misleading contextual expression
- evidence exists but conditions are unclear
- ambiguous disclosure

LOW:

- minor wording concern
- disclosure placement improvement

REVIEW_REQUIRED:

- insufficient regulatory evidence
- conflicting rules
- uncertain product classification
- incomplete extracted content

---

# 10. Frontend UX Rules

The most important screens are:

1. New Scan
2. Scan Result
3. YouTube Timeline Result
4. Issue Inspector
5. Scan History

Result UX priority:

Problem
→ Why
→ Regulation
→ Suggested Fix
→ Re-scan

Never start with a wall of legal text.

Legal details should be progressive disclosure.

---

# 11. YouTube UX Requirements

Video analysis is a signature feature.

For each issue detected from video, preserve:

- timestamp
- transcript segment
- visual frame reference if available
- issue severity
- regulation
- explanation

Clicking an issue should seek the player to the relevant timestamp whenever possible.

The result page must visually show issue markers on the timeline.

---

# 12. Recommended Tech Stack

Unless the existing repository dictates otherwise:

Frontend / Full-stack:

- Next.js
- TypeScript
- App Router
- React
- Tailwind CSS
- shadcn/ui

Backend:

- Next.js server routes for simple orchestration

For heavier AI/video jobs:

- separate worker/service if necessary

Database:

- PostgreSQL

ORM:

- Prisma or Drizzle

Vector search:

- pgvector initially

Authentication:

- optional for initial demo
- add only when Scan History requires persisted user data

AI:

- provider abstraction
- structured JSON output
- multimodal-capable model for images/video frames
- embeddings for regulatory RAG

Do not tightly couple business logic to one AI provider.

---

# 13. AI Provider Abstraction

Use an interface such as:

AIProvider

- classifyContent()
- extractClaims()
- analyzeCompliance()
- generateRewrite()
- analyzeImage()

Do not call provider SDKs directly from UI components.

AI output must always use validated structured schemas.

Use runtime validation such as Zod.

Reject malformed AI responses.

---

# 14. Performance Principles

The user should receive visible progress quickly.

Use staged processing.

Example:

FETCHING_CONTENT
EXTRACTING_CONTENT
CLASSIFYING
RETRIEVING_RULES
ANALYZING
VALIDATING
GENERATING_REPORT
COMPLETED

The frontend should display these stages.

Do not block the entire UX behind an unexplained spinner.

---

# 15. Security

Never expose AI provider keys to the browser.

Validate all external URLs.

Prevent SSRF for URL analysis.

Limit:

- upload file size
- allowed MIME types
- extracted page size
- transcript length
- number of analyzed video frames

Sanitize all extracted HTML.

Never execute arbitrary webpage JavaScript on the server unless using an isolated browser environment.

---

# 16. URL Analysis

For the first MVP, prefer safe server-side extraction.

Extract:

- page title
- meta description
- visible text
- headings
- image alt text
- structured metadata when relevant

Do NOT build a full arbitrary browser crawler unless necessary.

If dynamic-page extraction is required later, isolate browser execution.

---

# 17. Testing Requirements

Every major domain module requires tests.

Minimum:

### Unit Tests

- severity rules
- compliance pack selection
- deterministic pattern rules
- AI response parsing
- citation verification
- issue deduplication

### Evaluation Dataset

Maintain evaluation cases under:

evals/

Example:

evals/
general-advertising/
general-food/
influencer/

Each case includes:

- input
- expected category
- expected issue types
- expected source references when deterministic
- notes

Never claim model accuracy without running the evaluation dataset.

---

# 18. Demo Data

The application must include preset examples so judges can test immediately.

Required presets:

### Example A — AI SaaS

"업무 시간을 70% 줄여주는 국내 최고의 AI 서비스"

Expected:

- objective claim
- superiority claim
- evidence requirement

### Example B — General Food

"매일 한 잔으로 혈당 관리와 면역력 개선"

Expected:

- health-related risk
- general food classification

### Example C — Sponsored Content

A sample transcript containing:

- product recommendation
- coupon/link
- missing/ambiguous sponsorship disclosure

Do not depend on external content remaining available for the demo.

---

# 19. Error Handling

Never fabricate a result when analysis fails.

Examples:

Could not fetch URL
→ Ask user to paste content or upload screenshot.

Could not classify product
→ REVIEW_REQUIRED.

Could not retrieve a supporting regulation
→ Do not show unsupported legal citation.

Could not process YouTube transcript
→ Show partial analysis and clearly indicate unavailable signals.

---

# 20. Definition of Done

A feature is complete only when:

1. UI is implemented.
2. Loading state exists.
3. Empty state exists.
4. Error state exists.
5. Domain logic is separated from UI.
6. TypeScript has no errors.
7. Relevant tests pass.
8. AI output is schema validated.
9. No fabricated legal citations are possible through the intended path.
10. The feature can be demonstrated with seeded demo data.

---

# 21. Development Rules for Codex

Before modifying code:

1. Inspect the existing project.
2. Read this AGENTS.md.
3. Identify relevant files.
4. Preserve existing architecture unless a clear improvement is needed.
5. Make the smallest coherent implementation.

After each meaningful task:

1. Run formatting.
2. Run lint.
3. Run type checking.
4. Run relevant tests.
5. Report what changed.
6. Report remaining limitations.

Do not:

- rewrite unrelated files
- add unnecessary dependencies
- introduce premature microservices
- build unsupported categories
- fabricate legal rules
- silently swallow AI errors

---

# 22. MVP Priority Order

P0

- landing
- dashboard
- text scan
- general advertising compliance pack
- structured result
- regulation citations
- suggested rewrites

P1

- URL analysis
- general food compliance pack
- scan history
- evaluation system

P2

- YouTube transcript analysis
- timeline result
- influencer compliance pack

P3

- sampled video frame analysis
- OCR
- report export
- evidence upload / claim-evidence matching

Do not begin P2 until P0 works end-to-end.

Do not begin P3 until P1 is stable.

---

# 23. Final Product Rule

The product must optimize for:

"Can a creator or marketer understand what to change within 30 seconds?"

not:

"Can we show the most legal information?"

Whenever these goals conflict, prioritize actionable clarity while preserving access to official sources.
