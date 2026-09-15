'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  FileImage,
  Gauge,
  Globe2,
  History,
  Info,
  ExternalLink,
  Layers3,
  Link2,
  ListChecks,
  LoaderCircle,
  PlaySquare,
  Plus,
  RefreshCw,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { z } from 'zod';

import { analyzeContent } from '@/src/ai/analyze-content';
import { analyzeUrl } from '@/src/ai/analyze-url';
import { analyzeImage } from '@/src/ai/analyze-image';
import type { AnalysisStage } from '@/src/ai/providers/content-analysis-provider';
import { ImageScanInput } from './image-scan-input';
import {
  AI_SAAS_DEMO_FIXTURE_ID,
  GENERAL_FOOD_DEMO_FIXTURE_ID,
} from '@/src/content/web/fixture-web-content-extractor';
import type { PageSection } from '@/src/content/web/schemas';
import type {
  AnalysisAudience,
  Issue,
  ScanAnalysisResult,
  Severity,
} from '@/src/compliance/core/schemas';
import { SAFE_DEMO_REWRITE } from '@/src/compliance/packs/general-advertising/demo-data';
import { validatePublicHttpUrl } from '@/src/security/url-validator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export const DEMO_TEXT = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';
const HEALTH_FUNCTIONAL_FOOD_DEMO_TEXT =
  '건강기능식품으로 감기 예방과 면역력 강화에 도움을 드립니다.';
const FOOD_DEMO_PRESETS = [
  {
    label: '혈당·면역 표현',
    text: '매일 한 잔으로 혈당 관리와 면역력 개선',
  },
  {
    label: '감기 예방 표현',
    text: '감기 예방에 좋은 따뜻한 차',
  },
  {
    label: '일반 제품 표현',
    text: '구수하게 즐기는 무가당 보리차',
  },
] as const;

const analysisStages = [
  'EXTRACTING',
  'CLASSIFYING',
  'RETRIEVING',
  'ANALYZING',
  'VALIDATING',
] as const;
const textProgressStages = [
  '콘텐츠 준비',
  '문맥 분류 · 광고 주장 추출',
  '공식 규정 검색',
  'AI 위험 해석 · 수정안 생성',
  '출처 검증 · 결과 정리',
] as const;
const urlProgressStages = [
  '웹페이지 연결 · 콘텐츠 추출',
  ...textProgressStages.slice(1),
];
const imageProgressStages = [
  '이미지 문구 · 시각 정보 추출',
  ...textProgressStages.slice(1),
];

const webMcpInputSchema = z.object({
  text: z.string().trim().min(1).max(20000),
});

type View = 'dashboard' | 'new-scan' | 'progress' | 'result';
type AnalysisCategory =
  | 'AUTO'
  | 'HEALTH_FUNCTIONAL_FOOD'
  | 'PHARMACEUTICAL'
  | 'MEDICAL_DEVICE'
  | 'COSMETIC';

const ANALYSIS_CATEGORY_OPTIONS: Array<{
  value: Exclude<AnalysisCategory, 'AUTO'>;
  label: string;
}> = [
  { value: 'HEALTH_FUNCTIONAL_FOOD', label: '건강기능식품' },
  { value: 'PHARMACEUTICAL', label: '의약품' },
  { value: 'MEDICAL_DEVICE', label: '의료기기' },
  { value: 'COSMETIC', label: '화장품' },
];

const navItems: Array<{
  id: View | null;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'new-scan', label: 'New Scan', icon: Plus },
  { id: null, label: 'Scan History', icon: History },
  { id: null, label: 'Rule Packs', icon: ShieldCheck },
];

export function ContentLintApp() {
  const [view, setView] = useState<View>('dashboard');
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [lastInputType, setLastInputType] = useState<'text' | 'url' | 'image'>(
    'text',
  );
  const [scanTab, setScanTab] = useState<'text' | 'url' | 'image'>('text');
  const [analysisAudience, setAnalysisAudience] =
    useState<AnalysisAudience>('CONSUMER');
  const [analysisCategory, setAnalysisCategory] =
    useState<AnalysisCategory>('AUTO');
  const [productName, setProductName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [analyzedText, setAnalyzedText] = useState('');
  const [result, setResult] = useState<ScanAnalysisResult | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [selectedRewrite, setSelectedRewrite] = useState('');
  const [progressStage, setProgressStage] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [activeProgressStages, setActiveProgressStages] =
    useState<readonly string[]>(textProgressStages);
  const [lastUrlRequest, setLastUrlRequest] = useState<
    { url?: string; fixtureId?: string } | undefined
  >();

  const activeIssue = useMemo(
    () => result?.issues.find((issue) => issue.id === activeIssueId) ?? null,
    [activeIssueId, result],
  );

  const reportProgress = useCallback((stage: AnalysisStage) => {
    setProgressStage(analysisStages.indexOf(stage));
  }, []);

  const runAnalysis = useCallback(
    async (value: string, audience = analysisAudience) => {
      const normalizedText = value.trim();
      if (!normalizedText) return;

      setLastInputType('text');
      setAnalyzedText(normalizedText);
      setInputText(normalizedText);
      setAnalysisError(null);
      setDraftNotice(null);
      setActiveProgressStages(textProgressStages);
      setLastUrlRequest(undefined);
      setProgressStage(0);
      setView('progress');

      try {
        const nextResult = await analyzeContent(
          normalizedText,
          audience,
          buildRegulatedProductOptions(
            analysisCategory,
            productName,
            companyName,
            reportNumber,
          ),
          reportProgress,
        );
        const firstIssue = nextResult.issues[0] ?? null;
        setResult(nextResult);
        setActiveIssueId(firstIssue?.id ?? null);
        setSelectedRewrite(firstIssue?.suggestedRewrites[0] ?? '');
        setView('result');
        return nextResult;
      } catch (error) {
        setAnalysisError(
          error instanceof Error
            ? error.message
            : '분석 결과를 검증하지 못했습니다. 다시 시도해 주세요.',
        );
      }
    },
    [
      analysisAudience,
      analysisCategory,
      companyName,
      productName,
      reportNumber,
      reportProgress,
    ],
  );

  const runImageAnalysis = useCallback(async () => {
    if (!imageFile) return;
    setLastInputType('image');
    setLastUrlRequest(undefined);
    setAnalysisError(null);
    setDraftNotice(null);
    setProgressStage(0);
    setActiveProgressStages(imageProgressStages);
    setView('progress');
    try {
      const nextResult = await analyzeImage(
        imageFile,
        analysisAudience,
        buildRegulatedProductOptions(
          analysisCategory,
          productName,
          companyName,
          reportNumber,
        ),
        reportProgress,
      );
      const text = nextResult.imageContent?.analysisText ?? '';
      setAnalyzedText(text);
      setInputText(text);
      setResult(nextResult);
      const firstIssue = nextResult.issues[0] ?? null;
      setActiveIssueId(firstIssue?.id ?? null);
      setSelectedRewrite(firstIssue?.suggestedRewrites[0] ?? '');
      setView('result');
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : '이미지 분석을 완료하지 못했습니다.',
      );
    }
  }, [
    imageFile,
    analysisAudience,
    analysisCategory,
    productName,
    companyName,
    reportNumber,
    reportProgress,
  ]);

  const runUrlAnalysis = useCallback(
    async (request: { url?: string; fixtureId?: string }) => {
      if (!request.url && !request.fixtureId) return;
      if (request.url) setInputUrl(request.url);
      setLastInputType('url');
      setLastUrlRequest(request);
      setAnalysisError(null);
      setDraftNotice(null);
      setProgressStage(0);
      setActiveProgressStages(urlProgressStages);
      setView('progress');

      try {
        const nextResult = await analyzeUrl(
          {
            ...request,
            audience: analysisAudience,
            ...buildRegulatedProductOptions(
              analysisCategory,
              productName,
              companyName,
              reportNumber,
            ),
          },
          reportProgress,
        );
        const firstIssue = nextResult.issues[0] ?? null;
        setResult(nextResult);
        setAnalyzedText(nextResult.webContent?.visibleText ?? '');
        setActiveIssueId(firstIssue?.id ?? null);
        setSelectedRewrite(firstIssue?.suggestedRewrites[0] ?? '');
        setView('result');
        return nextResult;
      } catch (error) {
        setAnalysisError(
          error instanceof Error
            ? error.message
            : '웹페이지 분석 결과를 생성하지 못했습니다.',
        );
      }
    },
    [
      analysisAudience,
      analysisCategory,
      companyName,
      productName,
      reportNumber,
      reportProgress,
    ],
  );

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'analyze_advertising_text',
            title: '광고 문구 검사',
            description:
              '한국어 광고 문구를 ContentLint AI의 현재 검사 흐름으로 분석하고 화면에 결과를 표시합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 20000,
                  description: '검사할 한국어 광고 문구',
                },
              },
              required: ['text'],
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: false,
              untrustedContentHint: true,
            },
            async execute(input) {
              const parsed = webMcpInputSchema.parse(input);
              const analysis = await runAnalysis(parsed.text);
              if (!analysis) throw new Error('Analysis did not complete.');
              return {
                overallRisk: analysis.overallRisk,
                issueCount: analysis.issues.length,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // WebMCP is optional; the visible UI remains fully functional.
    }

    return () => lifecycle.abort();
  }, [runAnalysis]);

  const selectIssue = (issue: Issue) => {
    setActiveIssueId(issue.id);
    setSelectedRewrite(issue.suggestedRewrites[0]);
    setCopied(false);
  };

  const applySelectedRewrite = () => {
    if (!activeIssue || !selectedRewrite) return;
    setInputText(inputText.replace(activeIssue.originalText, selectedRewrite));
    setDraftNotice('선택한 표현을 수정 초안에 반영했습니다.');
  };

  const applyAllRewrites = () => {
    if (!result) return;
    const rewritten = result.issues.reduce(
      (draft, issue) =>
        draft.replace(
          issue.originalText,
          issue.suggestedRewrites[0] ?? issue.originalText,
        ),
      inputText,
    );
    setInputText(rewritten);
    setDraftNotice('추천 수정안을 모두 적용했습니다. 다시 검사해 보세요.');
  };

  const copyRewrite = async () => {
    if (!selectedRewrite) return;
    try {
      await navigator.clipboard.writeText(selectedRewrite);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const pageLabel =
    view === 'dashboard'
      ? 'Dashboard'
      : view === 'new-scan'
        ? 'New Scan'
        : view === 'progress'
          ? 'Analysis Progress'
          : 'Scan Result';

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-slate-200/90 bg-white">
        <SidebarHeader className="border-b border-slate-200/90 px-5 py-5">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => setView('dashboard')}
            type="button"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <ScanText className="size-[18px]" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-tight text-slate-950">
                ContentLint AI
              </span>
              <span className="block text-xs text-slate-500">
                Content compliance
              </span>
            </span>
          </button>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      className="h-10 rounded-xl px-3 text-sm data-active:bg-indigo-50 data-active:text-indigo-700"
                      isActive={
                        item.id === view ||
                        (item.id === 'new-scan' &&
                          (view === 'progress' || view === 'result'))
                      }
                      onClick={() => item.id && setView(item.id)}
                      disabled={!item.id}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                      {!item.id && (
                        <span className="ml-auto text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                          Soon
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-200/90 p-4">
          <div className="rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
            <span className="font-medium text-slate-700">
              Pre-screening only
            </span>
            <br />
            법률 자문이 아닌 사전 위험 점검 도구입니다.
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f8fafc]">
        <header className="flex h-16 shrink-0 items-center border-b border-slate-200/90 bg-white/85 px-4 backdrop-blur sm:px-7">
          <SidebarTrigger className="mr-3 md:hidden" />
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="truncate font-medium text-slate-900">
              {pageLabel}
            </span>
          </div>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Auto Detect · Advertising + Food + Regulated Products
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          {view === 'dashboard' && (
            <Dashboard
              onStart={() => {
                setScanTab('text');
                setView('new-scan');
              }}
              onUrlStart={() => {
                setScanTab('url');
                setView('new-scan');
              }}
              onUseDemo={() => {
                setInputText(DEMO_TEXT);
                setView('new-scan');
              }}
            />
          )}
          {view === 'new-scan' && (
            <NewScan
              imageFile={imageFile}
              setImageFile={setImageFile}
              onAnalyzeImage={() => void runImageAnalysis()}
              text={inputText}
              setText={setInputText}
              url={inputUrl}
              setUrl={setInputUrl}
              activeTab={scanTab}
              setActiveTab={setScanTab}
              audience={analysisAudience}
              setAudience={setAnalysisAudience}
              category={analysisCategory}
              setCategory={setAnalysisCategory}
              productName={productName}
              setProductName={setProductName}
              companyName={companyName}
              setCompanyName={setCompanyName}
              reportNumber={reportNumber}
              setReportNumber={setReportNumber}
              onUseHealthFunctionalFoodDemo={() => {
                setAnalysisCategory('HEALTH_FUNCTIONAL_FOOD');
                setProductName('건강기능식품 데모 제품');
                setCompanyName('');
                setReportNumber('');
                setInputText(HEALTH_FUNCTIONAL_FOOD_DEMO_TEXT);
                setScanTab('text');
              }}
              onAnalyze={() => void runAnalysis(inputText)}
              onAnalyzeUrl={() => void runUrlAnalysis({ url: inputUrl })}
              onAnalyzeDemoUrl={() =>
                void runUrlAnalysis({ fixtureId: AI_SAAS_DEMO_FIXTURE_ID })
              }
              onAnalyzeFoodDemoUrl={() =>
                void runUrlAnalysis({
                  fixtureId: GENERAL_FOOD_DEMO_FIXTURE_ID,
                })
              }
            />
          )}
          {view === 'progress' && (
            <AnalysisProgress
              activeStage={progressStage}
              stages={activeProgressStages}
              error={analysisError}
              onRetry={() =>
                lastInputType === 'image'
                  ? void runImageAnalysis()
                  : lastUrlRequest
                    ? void runUrlAnalysis(lastUrlRequest)
                    : void runAnalysis(inputText)
              }
              onBack={() => setView('new-scan')}
            />
          )}
          {view === 'result' && result && (
            <ScanResult
              result={result}
              analyzedText={analyzedText}
              draftText={inputText}
              setDraftText={setInputText}
              activeIssue={activeIssue}
              selectedRewrite={selectedRewrite}
              setSelectedRewrite={setSelectedRewrite}
              onSelectIssue={selectIssue}
              onApplyRewrite={applySelectedRewrite}
              onApplyAll={applyAllRewrites}
              onCopy={() => void copyRewrite()}
              copied={copied}
              draftNotice={draftNotice}
              onRescan={() =>
                result.inputType === 'URL'
                  ? void runUrlAnalysis(
                      result.webContent?.fixtureId
                        ? { fixtureId: result.webContent.fixtureId }
                        : { url: result.webContent?.url },
                    )
                  : void runAnalysis(inputText)
              }
              onNewScan={() => {
                setInputText('');
                setInputUrl('');
                setAnalysisCategory('AUTO');
                setProductName('');
                setCompanyName('');
                setReportNumber('');
                setResult(null);
                setView('new-scan');
              }}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Dashboard({
  onStart,
  onUrlStart,
  onUseDemo,
}: {
  onStart: () => void;
  onUrlStart: () => void;
  onUseDemo: () => void;
}) {
  return (
    <div className="space-y-9">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-indigo-600">
            Content checks
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[34px]">
            오늘 어떤 콘텐츠를 검사하시겠어요?
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-500">
            게시 전에 광고 표현의 잠재적 위험과 필요한 근거를 빠르게 확인하세요.
          </p>
        </div>
        <Button
          className="h-10 rounded-xl bg-indigo-600 px-4 shadow-sm shadow-indigo-200 hover:bg-indigo-700"
          onClick={onStart}
        >
          <Plus /> 새 검사
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ScanCard
          eyebrow="Available now"
          icon={ScanText}
          title="Text"
          description="광고 문구를 입력하고 위험 표현과 수정안을 확인합니다."
          onClick={onStart}
          active
        />
        <ScanCard
          eyebrow="Available now"
          icon={Globe2}
          title="Website / Product Page"
          description="URL에서 보이는 광고 표현을 추출해 검사합니다."
          onClick={onUrlStart}
          active
        />
        <ScanCard
          eyebrow="Coming soon"
          icon={PlaySquare}
          title="YouTube"
          description="자막과 화면 속 광고 표현을 타임라인으로 확인합니다."
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">Recent scans</h2>
            <p className="mt-1 text-sm text-slate-500">데모 검사 기록</p>
          </div>
          <Clock3 className="size-4 text-slate-400" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="px-6 text-xs text-slate-500">
                Content
              </TableHead>
              <TableHead className="text-xs text-slate-500">Category</TableHead>
              <TableHead className="text-xs text-slate-500">Risk</TableHead>
              <TableHead className="px-6 text-right text-xs text-slate-500">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              className="cursor-pointer"
              onClick={onUseDemo}
              tabIndex={0}
              onKeyDown={(event) => event.key === 'Enter' && onUseDemo()}
            >
              <TableCell className="max-w-[360px] truncate px-6 font-medium text-slate-800">
                {DEMO_TEXT}
              </TableCell>
              <TableCell className="text-slate-500">
                General Advertising
              </TableCell>
              <TableCell>
                <RiskBadge severity="HIGH" compact />
              </TableCell>
              <TableCell className="px-6 text-right text-slate-500">
                Demo
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="max-w-[360px] truncate px-6 font-medium text-slate-800">
                {SAFE_DEMO_REWRITE}
              </TableCell>
              <TableCell className="text-slate-500">
                General Advertising
              </TableCell>
              <TableCell>
                <RiskBadge severity="LOW" compact />
              </TableCell>
              <TableCell className="px-6 text-right text-slate-500">
                Demo
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function ScanCard({
  eyebrow,
  icon: Icon,
  title,
  description,
  active = false,
  onClick,
}: {
  eyebrow: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`relative min-h-[218px] border-0 py-0 shadow-[0_8px_30px_rgba(15,23,42,0.04)] ring-1 ${active ? 'ring-indigo-200' : 'ring-slate-200'}`}
    >
      <CardHeader className="px-6 pt-6">
        <span
          className={`mb-5 grid size-11 place-items-center rounded-xl ${active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}
        >
          <Icon className="size-5" />
        </span>
        <CardTitle className="text-[17px] font-semibold text-slate-950">
          {title}
        </CardTitle>
        <CardDescription className="mt-1 max-w-[31ch] leading-6">
          {description}
        </CardDescription>
        <CardAction>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {eyebrow}
          </span>
        </CardAction>
      </CardHeader>
      {active && (
        <CardContent className="mt-auto px-6 pb-6">
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            검사 시작 <ArrowRight className="size-4" />
          </button>
        </CardContent>
      )}
    </Card>
  );
}

function NewScan({
  imageFile,
  setImageFile,
  onAnalyzeImage,
  text,
  setText,
  url,
  setUrl,
  activeTab,
  setActiveTab,
  audience,
  setAudience,
  category,
  setCategory,
  productName,
  setProductName,
  companyName,
  setCompanyName,
  reportNumber,
  setReportNumber,
  onUseHealthFunctionalFoodDemo,
  onAnalyze,
  onAnalyzeUrl,
  onAnalyzeDemoUrl,
  onAnalyzeFoodDemoUrl,
}: {
  imageFile: File | null;
  setImageFile: (file: File | null) => void;
  onAnalyzeImage: () => void;
  text: string;
  setText: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  activeTab: 'text' | 'url' | 'image';
  setActiveTab: (value: 'text' | 'url' | 'image') => void;
  audience: AnalysisAudience;
  setAudience: (value: AnalysisAudience) => void;
  category: AnalysisCategory;
  setCategory: (value: AnalysisCategory) => void;
  productName: string;
  setProductName: (value: string) => void;
  companyName: string;
  setCompanyName: (value: string) => void;
  reportNumber: string;
  setReportNumber: (value: string) => void;
  onUseHealthFunctionalFoodDemo: () => void;
  onAnalyze: () => void;
  onAnalyzeUrl: () => void;
  onAnalyzeDemoUrl: () => void;
  onAnalyzeFoodDemoUrl: () => void;
}) {
  const tooLong = text.length > 20000;
  const urlError = getUrlValidationError(url);
  const productIdentityLabels = getProductIdentityLabels(category);
  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-sm font-medium text-indigo-600">New analysis</p>
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[34px]">
        새 콘텐츠 검사
      </h1>
      <p className="mt-3 text-base leading-7 text-slate-500">
        웹페이지 주소, 광고 문구 또는 이미지를 입력하면 문제 구간과 수정 방향을
        정리합니다.
      </p>
      <Card className="mt-8 gap-0 border-0 py-0 shadow-[0_10px_35px_rgba(15,23,42,0.05)] ring-1 ring-slate-200">
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-800">검사 목적</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              분석 기준과 위험도는 동일하며, 선택한 목적에 맞게 결과와 조치
              방법을 보여드립니다.
            </p>
          </div>
          <div
            className="mt-4 grid gap-3 sm:grid-cols-2"
            role="radiogroup"
            aria-label="검사 목적 선택"
          >
            <AudienceOption
              audience="CONSUMER"
              selected={audience === 'CONSUMER'}
              icon={ShoppingBag}
              title="광고를 보는 소비자"
              description="주의할 표현과 구매 전 확인할 정보를 봅니다."
              onSelect={setAudience}
            />
            <AudienceOption
              audience="BUSINESS"
              selected={audience === 'BUSINESS'}
              icon={Building2}
              title="광고를 만드는 기업·판매자"
              description="관련 법령, 수정안과 필요한 증빙을 봅니다."
              onSelect={setAudience}
            />
          </div>
        </div>
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold text-slate-800">제품 유형</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                규제 제품은 식약처 공식 품목정보가 확인될 때만 허가·심사 범위와
                광고 표현을 대조합니다.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-lg border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={onUseHealthFunctionalFoodDemo}
            >
              <Sparkles /> 건기식 데모
            </Button>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="제품 유형 선택"
          >
            <label
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition ${
                category === 'AUTO'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="analysis-category"
                checked={category === 'AUTO'}
                onChange={() => setCategory('AUTO')}
              />
              자동 감지
            </label>
            {ANALYSIS_CATEGORY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition ${
                  category === option.value
                    ? 'border-teal-300 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="analysis-category"
                  checked={category === option.value}
                  onChange={() => setCategory(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {category !== 'AUTO' && productIdentityLabels && (
            <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label
                  className="text-xs font-semibold text-slate-700"
                  htmlFor="regulated-product-name"
                >
                  제품명
                  <Input
                    id="regulated-product-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="공식 품목정보의 제품명"
                    className="mt-2 bg-white font-normal"
                  />
                </label>
                <label
                  className="text-xs font-semibold text-slate-700"
                  htmlFor="regulated-company-name"
                >
                  {productIdentityLabels.companyLabel}
                  <Input
                    id="regulated-company-name"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="선택 입력"
                    className="mt-2 bg-white font-normal"
                  />
                </label>
                <label
                  className="text-xs font-semibold text-slate-700"
                  htmlFor="regulated-report-number"
                >
                  {productIdentityLabels.numberLabel}
                  <Input
                    id="regulated-report-number"
                    value={reportNumber}
                    onChange={(event) => setReportNumber(event.target.value)}
                    placeholder="가장 정확한 조회 키"
                    className="mt-2 bg-white font-normal"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-teal-800">
                {productIdentityLabels.numberLabel}가 있으면 우선 사용합니다.
                제품을 확정하지 못하면 허가·심사 범위를 추정하지 않고 추가
                검토로 표시합니다.
              </p>
            </div>
          )}
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as 'text' | 'url' | 'image')
          }
        >
          <TabsList
            variant="line"
            className="h-14 w-full justify-start gap-6 border-b border-slate-200 px-6"
          >
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="youtube" disabled>
              YouTube
            </TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="video" disabled>
              Video
            </TabsTrigger>
          </TabsList>
          <TabsContent value="image" className="p-6 sm:p-8">
            <ImageScanInput
              file={imageFile}
              setFile={setImageFile}
              onAnalyze={onAnalyzeImage}
            />
          </TabsContent>
          <TabsContent value="url" className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label
                className="text-sm font-semibold text-slate-800"
                htmlFor="scan-url"
              >
                웹사이트 또는 상품 상세페이지 URL
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={onAnalyzeDemoUrl}
                >
                  <Sparkles /> AI SaaS 데모
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={onAnalyzeFoodDemoUrl}
                >
                  <Sparkles /> 일반식품 데모
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-xs ring-1 ring-slate-200">
                  <Globe2 className="size-4" />
                </span>
                <Input
                  id="scan-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  aria-invalid={Boolean(urlError)}
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm"
                />
              </div>
              <p
                className={`mt-3 text-xs ${urlError ? 'text-red-600' : 'text-slate-500'}`}
              >
                {urlError ??
                  '공개된 http/https 정적 HTML 페이지를 안전하게 가져옵니다.'}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                size="lg"
                disabled={!url.trim() || Boolean(urlError)}
                onClick={onAnalyzeUrl}
                className="h-11 rounded-xl bg-indigo-600 px-5 shadow-sm shadow-indigo-200 hover:bg-indigo-700"
              >
                <Globe2 /> 웹페이지 검사
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="text" className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label
                className="text-sm font-semibold text-slate-800"
                htmlFor="scan-text"
              >
                광고 문구
              </label>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => setText(DEMO_TEXT)}
              >
                <Sparkles /> AI SaaS 데모
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-teal-200 text-teal-700 hover:bg-teal-50"
                onClick={onUseHealthFunctionalFoodDemo}
              >
                <Sparkles /> 건기식 데모
              </Button>
            </div>
            <div
              className="mb-4 flex flex-wrap gap-2"
              aria-label="일반식품 데모 문구"
            >
              {FOOD_DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.text}
                  type="button"
                  onClick={() => setText(preset.text)}
                  className="rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Textarea
              id="scan-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="검사할 광고 문구를 입력하세요."
              aria-invalid={tooLong}
              className="min-h-48 resize-none rounded-xl border-slate-200 bg-slate-50/60 p-4 text-base leading-7 focus-visible:bg-white focus-visible:ring-indigo-100"
            />
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className={tooLong ? 'text-red-600' : 'text-slate-400'}>
                {tooLong
                  ? '20,000자 이하로 입력해 주세요.'
                  : '한국어 광고 문구 · 카테고리 자동 감지'}
              </span>
              <span
                className={
                  tooLong ? 'font-medium text-red-600' : 'text-slate-400'
                }
              >
                {text.length} / 20,000
              </span>
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                size="lg"
                disabled={!text.trim() || tooLong}
                onClick={onAnalyze}
                className="h-11 rounded-xl bg-indigo-600 px-5 shadow-sm shadow-indigo-200 hover:bg-indigo-700"
              >
                <Sparkles /> AI 분석 시작
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
        <FileImage className="mt-1 size-4 shrink-0 text-slate-400" />
        공개 웹페이지의 텍스트·이미지 대체 설명, 광고 문구, 업로드 이미지를
        검사합니다. 로그인 페이지, JavaScript 렌더링, YouTube·동영상은 지원하지
        않습니다.
      </div>
    </div>
  );
}

function AudienceOption({
  audience,
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  audience: AnalysisAudience;
  selected: boolean;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onSelect: (audience: AnalysisAudience) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-100'
          : 'cursor-pointer border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <input
        type="radio"
        name="analysis-audience"
        value={audience}
        checked={selected}
        onChange={() => onSelect(audience)}
        className="sr-only"
      />
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-lg ${
          selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <Icon className="size-4.5" />
      </span>
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {selected && <Check className="size-4 text-indigo-600" />}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function AnalysisProgress({
  activeStage,
  stages,
  error,
  onRetry,
  onBack,
}: {
  activeStage: number;
  stages: readonly string[];
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const progress = Math.min(95, ((activeStage + 1) / stages.length) * 100);
  return (
    <div className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-2xl items-center justify-center">
      <Card className="w-full border-0 px-2 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <CardHeader className="px-6 pb-3 pt-6 text-center sm:px-10 sm:pt-9">
          <span
            className={`mx-auto mb-5 grid size-13 place-items-center rounded-2xl ${error ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}
          >
            {error ? (
              <TriangleAlert className="size-6" />
            ) : (
              <LoaderCircle className="size-6 animate-spin" />
            )}
          </span>
          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">
            {error
              ? '분석을 완료하지 못했습니다'
              : '콘텐츠를 검사하고 있습니다'}
          </CardTitle>
          <CardDescription className="mt-2 text-base leading-6">
            {error ??
              'Gemini가 문맥과 공식 근거를 대조합니다. 콘텐츠 양에 따라 시간이 걸릴 수 있습니다.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-7 sm:px-10 sm:pb-9">
          {!error ? (
            <>
              <Progress
                value={progress}
                aria-label="분석 진행률"
                className="mt-4 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-indigo-600"
              />
              <ol className="mt-7 space-y-1.5">
                {stages.map((stage, index) => {
                  const isDone = index < activeStage;
                  const isActive = index === activeStage;
                  return (
                    <li
                      key={stage}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-800' : isDone ? 'text-slate-700' : 'text-slate-400'}`}
                    >
                      <span
                        className={`grid size-6 place-items-center rounded-full border ${isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : isActive ? 'border-indigo-200 bg-white text-indigo-600' : 'border-slate-200 bg-white'}`}
                      >
                        {isDone ? (
                          <Check className="size-3.5" />
                        ) : (
                          <span className="text-[11px]">{index + 1}</span>
                        )}
                      </span>
                      {stage}
                      {isActive && (
                        <span className="ml-auto text-xs font-normal text-indigo-500">
                          진행 중
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft /> 입력으로 돌아가기
              </Button>
              <Button
                onClick={onRetry}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <RefreshCw /> 다시 시도
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanResult({
  result,
  analyzedText,
  draftText,
  setDraftText,
  activeIssue,
  selectedRewrite,
  setSelectedRewrite,
  onSelectIssue,
  onApplyRewrite,
  onApplyAll,
  onCopy,
  copied,
  draftNotice,
  onRescan,
  onNewScan,
}: {
  result: ScanAnalysisResult;
  analyzedText: string;
  draftText: string;
  setDraftText: (text: string) => void;
  activeIssue: Issue | null;
  selectedRewrite: string;
  setSelectedRewrite: (rewrite: string) => void;
  onSelectIssue: (issue: Issue) => void;
  onApplyRewrite: () => void;
  onApplyAll: () => void;
  onCopy: () => void;
  copied: boolean;
  draftNotice: string | null;
  onRescan: () => void;
  onNewScan: () => void;
}) {
  const isLow = result.overallRisk === 'LOW';
  const isWeb = result.inputType === 'URL' && Boolean(result.webContent);
  const isBusiness = result.audience === 'BUSINESS';
  const { keyIssues, otherIssues } = splitKeyIssues(result);
  return (
    <div className="space-y-6">
      {result.imageContent && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
          <p className="font-semibold">
            이미지 분석 · {result.imageContent.fileName}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">
              추출한 문구와 시각 관찰 확인
            </summary>
            <p className="mt-3 whitespace-pre-wrap leading-7">
              {result.imageContent.analysisText}
            </p>
          </details>
          <p className="mt-2 text-xs text-slate-500">
            시각 관찰은 AI의 이미지 해석입니다. 수정안을 적용한 뒤에는 새
            이미지를 업로드해 다시 검사하세요.
          </p>
        </div>
      )}
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <button
              type="button"
              onClick={onNewScan}
              className="inline-flex items-center gap-1 hover:text-slate-800"
            >
              <ArrowLeft className="size-3.5" /> New Scan
            </button>
            <ChevronRight className="size-3.5" />
            <span>Result</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
            {isWeb
              ? (result.webContent?.title ?? '웹페이지 검사 결과')
              : '검사 결과'}
          </h1>
          {isWeb && result.webContent && (
            <a
              href={result.webContent.finalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex max-w-2xl items-center gap-1.5 truncate text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Link2 className="size-3.5 shrink-0" />
              <span className="truncate">{result.webContent.finalUrl}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
          <p className="mt-2 text-base text-slate-500">
            {isLow
              ? '현재 적용 규칙과 공식 규정 검색 기준에서 높은 위험 표현이 발견되지 않았습니다.'
              : isBusiness
                ? '게시 전에 조치가 필요한 표현과 관련 검토 기준을 정리했습니다.'
                : '주의해서 확인할 필요가 있는 광고 표현을 찾았습니다.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              className={
                isBusiness
                  ? 'bg-violet-100 text-violet-800'
                  : 'bg-sky-100 text-sky-800'
              }
            >
              {isBusiness ? (
                <Building2 className="size-3" />
              ) : (
                <ShoppingBag className="size-3" />
              )}
              {isBusiness ? '기업·판매자용 결과' : '소비자용 결과'}
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-200 bg-white text-slate-700"
            >
              Detected Category · {formatCategory(result.detectedCategory)}
            </Badge>
            {result.analysisModel && (
              <Badge
                variant="outline"
                className={
                  result.metrics?.mode === 'offline'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }
              >
                {formatAnalysisModel(result)}
              </Badge>
            )}
            {result.activePacks.map((packId) => (
              <Badge
                key={packId}
                className={
                  packId === 'GENERAL_FOOD'
                    ? 'bg-emerald-100 text-emerald-800'
                    : packId === 'HEALTH_FUNCTIONAL_FOOD'
                      ? 'bg-teal-100 text-teal-800'
                      : packId === 'PHARMACEUTICAL'
                        ? 'bg-rose-100 text-rose-800'
                        : packId === 'MEDICAL_DEVICE'
                          ? 'bg-cyan-100 text-cyan-800'
                          : packId === 'COSMETIC'
                            ? 'bg-fuchsia-100 text-fuchsia-800'
                            : 'bg-indigo-100 text-indigo-800'
                }
              >
                {formatPack(packId)} Pack
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {isWeb && (
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={onRescan}
            >
              <RefreshCw /> 웹페이지 다시 검사
            </Button>
          )}
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={onNewScan}
          >
            <Plus /> 새 검사
          </Button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryMetric
          label="Detected"
          value={formatContentType(result.detectedContentType)}
          icon={ScanText}
        />
        <SummaryMetric
          label="Elapsed"
          value={formatElapsed(result)}
          icon={Clock3}
        />
        <SummaryMetric
          label="Category"
          value={formatCategory(result.detectedCategory)}
          icon={Layers3}
        />
        <SummaryMetric
          label="Overall Risk"
          value={<RiskBadge severity={result.overallRisk} />}
          icon={ShieldAlert}
        />
        <SummaryMetric
          label="Claims Found"
          value={`${result.claims.length} Claims`}
          icon={ScanText}
        />
        <SummaryMetric
          label={isWeb ? 'Issues' : 'Findings'}
          value={`${result.issues.length} Risks Found`}
          icon={Clipboard}
        />
      </section>
      {result.metrics && <ValueMetricNote result={result} />}
      {result.notices.length > 0 && (
        <div className="space-y-2">
          {result.notices.map((notice) => (
            <div
              key={notice.code}
              className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900"
            >
              <Info className="mt-1 size-4 shrink-0" /> {notice.message}
            </div>
          ))}
        </div>
      )}
      {result.productAuthorization && (
        <ProductAuthorizationCard result={result} />
      )}
      {process.env.NODE_ENV === 'development' && result.debug && (
        <RetrievalDebugPanel debug={result.debug} />
      )}
      {isBusiness && result.issues.length > 0 && (
        <BusinessActionPlan result={result} />
      )}
      {isWeb && result.webContent ? (
        <WebScanResultBody
          result={result}
          activeIssue={activeIssue}
          selectedRewrite={selectedRewrite}
          setSelectedRewrite={setSelectedRewrite}
          onSelectIssue={onSelectIssue}
          onCopy={onCopy}
          copied={copied}
        />
      ) : isLow ? (
        <LowRiskResult
          text={analyzedText}
          audience={result.audience}
          onNewScan={onNewScan}
        />
      ) : result.issues.length === 0 ? (
        <ReviewRequiredEmptyState text={analyzedText} onNewScan={onNewScan} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-6">
            <Card className="border-0 py-0 shadow-sm ring-1 ring-slate-200">
              <CardHeader className="border-b border-slate-200 px-6 py-5">
                <CardTitle className="text-base font-semibold text-slate-900">
                  분석한 원문
                </CardTitle>
                <CardDescription>
                  색상과 라벨이 표시된 구간을 선택하면 상세 내용을 확인할 수
                  있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 py-6">
                <HighlightedText
                  text={analyzedText}
                  result={result}
                  activeIssueId={activeIssue?.id ?? null}
                  onSelectIssue={onSelectIssue}
                />
              </CardContent>
            </Card>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  핵심 이슈
                </h2>
                <span className="text-sm text-slate-500">
                  우선 확인 {keyIssues.length}개 · 전체 {result.issues.length}개
                </span>
              </div>
              <div className="space-y-3">
                {keyIssues.map((issue, index) => (
                  <IssueListItem
                    key={issue.id}
                    issue={issue}
                    index={index}
                    active={activeIssue?.id === issue.id}
                    legalBasis={
                      isBusiness
                        ? (formatPrimaryLegalBasis(issue, result) ??
                          '공식 근거 추가 확인 필요')
                        : null
                    }
                    onSelect={() => onSelectIssue(issue)}
                  />
                ))}
              </div>
              {otherIssues.length > 0 && (
                <details className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    기타 검토 항목 {otherIssues.length}개 보기
                  </summary>
                  <div className="mt-3 space-y-3">
                    {otherIssues.map((issue, index) => (
                      <IssueListItem
                        key={issue.id}
                        issue={issue}
                        index={keyIssues.length + index}
                        active={activeIssue?.id === issue.id}
                        legalBasis={
                          isBusiness
                            ? (formatPrimaryLegalBasis(issue, result) ??
                              '공식 근거 추가 확인 필요')
                            : null
                        }
                        onSelect={() => onSelectIssue(issue)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
            <RewriteDraft
              value={draftText}
              onChange={setDraftText}
              notice={draftNotice}
              onApplyAll={onApplyAll}
              onRescan={onRescan}
            />
          </div>
          {activeIssue && (
            <IssueInspector
              issue={activeIssue}
              result={result}
              selectedRewrite={selectedRewrite}
              setSelectedRewrite={setSelectedRewrite}
              onApplyRewrite={onApplyRewrite}
              onCopy={onCopy}
              copied={copied}
              canApplyRewrite
            />
          )}
        </div>
      )}
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
        {isBusiness
          ? '표시된 법령은 잠재적 검토 기준입니다. 개별 광고의 위법 여부를 확정하는 법률 자문이나 공식 심의를 대체하지 않습니다.'
          : '본 결과는 공식 심의나 법률 자문을 대체하지 않는 사전 점검 정보입니다.'}
      </p>
    </div>
  );
}

function IssueListItem({
  issue,
  index,
  active,
  legalBasis,
  onSelect,
}: {
  issue: Issue;
  index: number;
  active: boolean;
  legalBasis: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm transition ${active ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-50 text-sm font-semibold text-red-700">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-2 flex flex-wrap items-center gap-2">
          <RiskBadge severity={issue.severity} compact />
          <span className="font-semibold text-slate-900">
            “{issue.originalText}”
          </span>
        </span>
        <span className="block line-clamp-2 text-sm leading-6 text-slate-500">
          {issue.explanation}
        </span>
        {legalBasis && (
          <span className="mt-2 block text-xs font-medium text-violet-700">
            검토 기준 · {legalBasis}
          </span>
        )}
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" />
    </button>
  );
}

// Manual pre-publication review time is an assumption until measured with
// real users; the UI must never present it as a measured fact.
const MANUAL_REVIEW_BASELINE_MINUTES = 30;

function ValueMetricNote({ result }: { result: ScanAnalysisResult }) {
  const metrics = result.metrics;
  if (!metrics) return null;
  const seconds = metrics.elapsedMs / 1000;
  const speedup =
    metrics.elapsedMs > 0
      ? Math.round((MANUAL_REVIEW_BASELINE_MINUTES * 60) / seconds)
      : null;
  const providers = metrics.attempts.map(
    (attempt) =>
      `${attempt.provider}/${attempt.model} ${attempt.outcome === 'success' ? '성공' : `실패(${attempt.code ?? 'error'})`} ${(attempt.elapsedMs / 1000).toFixed(1)}초`,
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
        <Gauge className="size-3.5" />
        이번 분석 {formatElapsed(result)}
      </span>
      <span>
        수동 사전검수 기준선 {MANUAL_REVIEW_BASELINE_MINUTES}분(가정) 대비{' '}
        {speedup ? `약 ${speedup.toLocaleString()}배` : '비교 불가'}
      </span>
      {metrics.mode === 'offline' ? (
        <span className="text-amber-700">
          AI 제공자 실패 → 규칙·규정 검색만 사용
        </span>
      ) : (
        providers.length > 0 && (
          <span className="text-slate-500">{providers.join(' → ')}</span>
        )
      )}
    </div>
  );
}

function ProductAuthorizationCard({ result }: { result: ScanAnalysisResult }) {
  const authorization = result.productAuthorization!;
  const product = authorization.selectedProduct;
  const verified = authorization.status === 'VERIFIED' && Boolean(product);
  const display = getAuthorizationDisplay(result.detectedCategory);
  const statusLabel = {
    VERIFIED: '허가정보 연결됨',
    NOT_FOUND: '일치 제품 없음',
    AMBIGUOUS: '제품 확정 필요',
    UNAVAILABLE: '조회 미완료',
  }[authorization.status];

  return (
    <Card className="gap-0 border-0 py-0 shadow-sm ring-1 ring-teal-200">
      <CardHeader className="border-b border-teal-100 bg-teal-50/60 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <ShieldCheck className="size-4 text-teal-700" /> 공식 품목정보
              기반 분석
            </CardTitle>
            <CardDescription className="mt-1">
              {display.description}
            </CardDescription>
          </div>
          <Badge
            className={
              verified
                ? 'bg-teal-100 text-teal-800'
                : 'bg-blue-100 text-blue-800'
            }
          >
            {verified ? <CheckCircle2 /> : <Info />} {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-5">
        <p className="text-sm leading-6 text-slate-600">
          {authorization.message}
        </p>
        {product ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AuthorizationField label="제품명" value={product.productName} />
            <AuthorizationField
              label={display.companyLabel}
              value={product.companyName}
            />
            <AuthorizationField
              label={display.numberLabel}
              value={product.reportNumber}
            />
            <AuthorizationField
              label="제품 유형"
              value={product.productType || product.productForm}
            />
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
              <p className="text-xs font-semibold text-slate-400">
                {display.scopeLabel}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-800">
                {product.primaryFunctionality || '정보 없음 — 추가 확인 필요'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
              <p className="text-xs font-semibold text-slate-400">
                {display.methodLabel}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-800">
                {product.intakeMethod || '정보 없음 — 추가 확인 필요'}
              </p>
            </div>
          </div>
        ) : authorization.candidates.length > 0 ? (
          <div className="mt-4 space-y-2">
            {authorization.candidates.slice(0, 3).map((candidate) => (
              <div
                key={`${candidate.reportNumber}-${candidate.productName}`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
              >
                <span className="font-semibold">{candidate.productName}</span>
                <span className="ml-2 text-slate-500">
                  {candidate.companyName} · {candidate.reportNumber}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <a
          href={authorization.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-900"
        >
          {display.sourceLinkLabel} <ExternalLink className="size-3" />
        </a>
      </CardContent>
    </Card>
  );
}

function AuthorizationField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-slate-800">
        {value || '정보 없음'}
      </p>
    </div>
  );
}

function BusinessActionPlan({ result }: { result: ScanAnalysisResult }) {
  const rewriteCount = result.issues.filter(
    (issue) => issue.resolutionType === 'REMOVE_OR_REWRITE',
  ).length;
  const evidenceCount = result.issues.filter(
    (issue) => issue.resolutionType === 'PROVIDE_EVIDENCE',
  ).length;
  const reviewCount = result.issues.filter((issue) =>
    ['VERIFY_PRODUCT_CLASSIFICATION', 'HUMAN_REVIEW'].includes(
      issue.resolutionType,
    ),
  ).length;

  return (
    <Card className="gap-0 border-0 py-0 shadow-sm ring-1 ring-violet-200">
      <CardHeader className="border-b border-violet-100 bg-violet-50/60 px-6 py-5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950">
          <ListChecks className="size-4 text-violet-700" /> 게시 전 조치 요약
        </CardTitle>
        <CardDescription>
          위험도가 높은 표현부터 근거를 준비하거나 문구를 수정한 뒤 다시
          검사하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <BusinessActionMetric
            label="삭제·수정 권고"
            value={rewriteCount}
            tone="red"
          />
          <BusinessActionMetric
            label="객관적 근거 필요"
            value={evidenceCount}
            tone="amber"
          />
          <BusinessActionMetric
            label="추가 검토 필요"
            value={reviewCount}
            tone="blue"
          />
        </div>
        <ol className="mt-5 space-y-3">
          {result.issues.map((issue, index) => (
            <li
              key={issue.id}
              className="grid gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)] sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {index + 1}. “{issue.originalText}”
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {formatPrimaryLegalBasis(issue, result) ??
                    '검증된 공식 규정 근거를 추가로 확인해야 합니다.'}
                </p>
              </div>
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium leading-5 text-violet-900">
                {formatResolutionType(issue.resolutionType)}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function BusinessActionMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'amber' | 'blue';
}) {
  const className = {
    red: 'border-red-100 bg-red-50 text-red-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${className}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}건</p>
    </div>
  );
}

function WebScanResultBody({
  result,
  activeIssue,
  selectedRewrite,
  setSelectedRewrite,
  onSelectIssue,
  onCopy,
  copied,
}: {
  result: ScanAnalysisResult;
  activeIssue: Issue | null;
  selectedRewrite: string;
  setSelectedRewrite: (rewrite: string) => void;
  onSelectIssue: (issue: Issue) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const content = result.webContent!;
  const navigationSections = content.sections
    .filter(
      (section) =>
        section.heading &&
        [
          'HERO',
          'HEADING',
          'FEATURE',
          'PRICING',
          'TESTIMONIAL',
          'FAQ',
        ].includes(section.type),
    )
    .slice(0, 8);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0 space-y-5">
        <Card className="gap-0 border-0 py-0 shadow-sm ring-1 ring-slate-200">
          <CardHeader className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <CardTitle className="text-base font-semibold text-slate-900">
              분석한 페이지 콘텐츠
            </CardTitle>
            <CardDescription>
              페이지에서 추출한 주요 구간과 광고 Claim입니다.
            </CardDescription>
          </CardHeader>
          {navigationSections.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3 sm:px-6">
              {navigationSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`page-${section.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                >
                  {section.heading}
                </button>
              ))}
            </div>
          )}
          <CardContent className="space-y-3 px-5 py-5 sm:px-6">
            {content.sections.map((section) => (
              <PageSectionCard
                key={section.id}
                section={section}
                result={result}
                activeIssueId={activeIssue?.id ?? null}
                onSelectIssue={onSelectIssue}
              />
            ))}
          </CardContent>
        </Card>
      </div>
      {activeIssue ? (
        <IssueInspector
          issue={activeIssue}
          result={result}
          selectedRewrite={selectedRewrite}
          setSelectedRewrite={setSelectedRewrite}
          onApplyRewrite={() => undefined}
          onCopy={onCopy}
          copied={copied}
          canApplyRewrite={false}
        />
      ) : (
        <Card className="sticky top-6 border-0 shadow-sm ring-1 ring-slate-200">
          <CardContent className="px-6 py-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-600">
              {result.overallRisk === 'LOW' ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <Info className="size-5" />
              )}
            </span>
            <RiskBadge severity={result.overallRisk} />
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {result.overallRisk === 'LOW'
                ? '현재 적용된 Compliance Pack에서 우선 검토할 Claim을 찾지 못했습니다.'
                : '현재 활성화된 Compliance Pack만으로 판단하지 않고 추가 검토 대상으로 남겼습니다.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PageSectionCard({
  section,
  result,
  activeIssueId,
  onSelectIssue,
}: {
  section: PageSection;
  result: ScanAnalysisResult;
  activeIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
}) {
  const claims = result.claims.filter(
    (claim) => claim.sourceSectionId === section.id,
  );
  const issues = claims.flatMap((claim) => {
    const issue = result.issues.find(
      (candidate) => candidate.claimId === claim.id,
    );
    return issue ? [{ claim, issue }] : [];
  });
  const active = issues.some(({ issue }) => issue.id === activeIssueId);

  return (
    <section
      id={`page-${section.id}`}
      className={`scroll-mt-24 rounded-xl border px-4 py-4 transition ${active ? 'border-red-300 bg-red-50/30 ring-2 ring-red-100' : issues.length > 0 ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200 bg-slate-50/50'}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="bg-white text-[10px] text-slate-500"
        >
          {formatSectionType(section.type)}
        </Badge>
        {section.heading && section.heading !== section.text && (
          <span className="text-xs font-semibold text-slate-500">
            {section.heading}
          </span>
        )}
      </div>
      <HighlightedSectionText
        text={section.text}
        issues={issues}
        activeIssueId={activeIssueId}
        onSelectIssue={onSelectIssue}
      />
    </section>
  );
}

function HighlightedSectionText({
  text,
  issues,
  activeIssueId,
  onSelectIssue,
}: {
  text: string;
  issues: Array<{
    claim: ScanAnalysisResult['claims'][number];
    issue: Issue;
  }>;
  activeIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
}) {
  const matches = issues
    .map(({ claim, issue }) => ({
      issue,
      start: text.indexOf(claim.text),
      end: text.indexOf(claim.text) + claim.text.length,
    }))
    .filter((match) => match.start >= 0)
    .sort((a, b) => a.start - b.start);
  const content: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start < cursor) return;
    if (match.start > cursor) content.push(text.slice(cursor, match.start));
    content.push(
      <button
        key={match.issue.id}
        type="button"
        onClick={() => onSelectIssue(match.issue)}
        className={`mx-0.5 rounded-md px-1.5 py-1 font-semibold underline decoration-2 underline-offset-4 transition ${getIssueHighlightClass(match.issue.severity, match.issue.id === activeIssueId)}`}
      >
        {text.slice(match.start, match.end)}
        <span className="sr-only"> {match.issue.severity} RISK</span>
      </button>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) content.push(text.slice(cursor));
  return <p className="text-sm leading-7 text-slate-700">{content}</p>;
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-500">
        <Icon className="size-[18px]" />
      </span>
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">{label}</p>
        <div className="text-sm font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  result,
  activeIssueId,
  onSelectIssue,
}: {
  text: string;
  result: ScanAnalysisResult;
  activeIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
}) {
  const segments: ReactNode[] = [];
  const sortedClaims = [...result.claims].sort(
    (a, b) => a.startOffset - b.startOffset,
  );
  let cursor = 0;
  sortedClaims.forEach((claim) => {
    const issue = result.issues.find(
      (candidate) => candidate.claimId === claim.id,
    );
    if (!issue) return;
    if (claim.startOffset > cursor)
      segments.push(text.slice(cursor, claim.startOffset));
    segments.push(
      <button
        key={claim.id}
        type="button"
        onClick={() => onSelectIssue(issue)}
        className={`mx-0.5 rounded-md px-1.5 py-1 font-semibold underline decoration-red-400 decoration-2 underline-offset-4 transition ${activeIssueId === issue.id ? 'bg-red-100 text-red-900 ring-2 ring-red-200' : 'bg-red-50 text-red-800 hover:bg-red-100'}`}
      >
        {text.slice(claim.startOffset, claim.endOffset)}
        <span className="sr-only"> HIGH RISK</span>
      </button>,
    );
    cursor = claim.endOffset;
  });
  if (cursor < text.length) segments.push(text.slice(cursor));
  return <p className="text-lg leading-10 text-slate-800">{segments}</p>;
}

function RewriteDraft({
  value,
  onChange,
  notice,
  onApplyAll,
  onRescan,
}: {
  value: string;
  onChange: (value: string) => void;
  notice: string | null;
  onApplyAll: () => void;
  onRescan: () => void;
}) {
  return (
    <Card className="border-0 py-0 shadow-sm ring-1 ring-indigo-200">
      <CardHeader className="border-b border-indigo-100 bg-indigo-50/50 px-6 py-5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Sparkles className="size-4 text-indigo-600" /> 수정 초안
        </CardTitle>
        <CardDescription>
          수정안을 적용하거나 직접 고친 뒤 다시 검사하세요.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
            onClick={onApplyAll}
          >
            추천 수정안 모두 적용
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-6 py-6">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-28 resize-none rounded-xl border-slate-200 p-4 text-base leading-7"
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={`text-sm ${notice ? 'font-medium text-emerald-700' : 'text-slate-400'}`}
            aria-live="polite"
          >
            {notice ?? '수정한 내용은 재검사 전까지 초안으로 유지됩니다.'}
          </p>
          <Button
            disabled={!value.trim()}
            onClick={onRescan}
            className="h-10 rounded-xl bg-indigo-600 px-4 hover:bg-indigo-700"
          >
            <RefreshCw /> 수정 문구 재검사
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IssueInspector({
  issue,
  result,
  selectedRewrite,
  setSelectedRewrite,
  onApplyRewrite,
  onCopy,
  copied,
  canApplyRewrite = true,
}: {
  issue: Issue;
  result: ScanAnalysisResult;
  selectedRewrite: string;
  setSelectedRewrite: (rewrite: string) => void;
  onApplyRewrite: () => void;
  onCopy: () => void;
  copied: boolean;
  canApplyRewrite?: boolean;
}) {
  const sources = result.sources.filter((source) =>
    issue.regulationSourceIds.includes(source.id),
  );
  const enforcementCases = result.enforcementCases.filter((item) =>
    issue.similarEnforcementCaseIds.includes(item.id),
  );
  const claim = result.claims.find(
    (candidate) => candidate.id === issue.claimId,
  );
  const pageSection = result.webContent?.sections.find(
    (section) => section.id === claim?.sourceSectionId,
  );
  const isBusiness = result.audience === 'BUSINESS';
  return (
    <aside className="sticky top-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950">
            {isBusiness ? '판매자 조치 가이드' : 'Issue Inspector'}
          </h2>
          <RiskBadge severity={issue.severity} compact />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">{formatIssueType(issue.category)}</Badge>
          <Badge variant="outline">{formatPack(issue.packId)} Pack</Badge>
        </div>
      </div>
      <div className="max-h-[calc(100vh-11rem)] space-y-6 overflow-y-auto px-5 py-5">
        <InspectorSection
          title={isBusiness ? '문제가 될 수 있는 표현' : 'Original Claim'}
        >
          <p className="rounded-xl bg-red-50 px-4 py-3 font-medium leading-6 text-red-900">
            “{issue.originalText}”
          </p>
        </InspectorSection>
        {pageSection && (
          <InspectorSection title="Page Source">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700">
                {formatSectionType(pageSection.type)} Section
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {pageSection.heading ?? pageSection.text}
              </p>
            </div>
          </InspectorSection>
        )}
        <InspectorSection title={isBusiness ? '잠재적 법적 쟁점' : 'Reason'}>
          <p className="text-sm leading-6 text-slate-600">
            {issue.explanation}
          </p>
          {issue.uncertaintyReason && (
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              추가 확인: {issue.uncertaintyReason}
            </p>
          )}
        </InspectorSection>
        <InspectorSection title="권장 조치">
          <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-medium text-indigo-900">
            {formatResolutionType(issue.resolutionType)}
          </p>
          {isBusiness && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {getBusinessActionDetail(issue)}
            </p>
          )}
        </InspectorSection>
        {issue.requiredEvidence.length > 0 && (
          <InspectorSection
            title={isBusiness ? '게시 전 준비할 증빙' : 'Required Evidence'}
          >
            <ul className="grid grid-cols-2 gap-2">
              {issue.requiredEvidence.map((evidence) => (
                <li
                  key={evidence}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                >
                  <span className="size-1.5 rounded-full bg-slate-400" />
                  {evidence}
                </li>
              ))}
            </ul>
          </InspectorSection>
        )}
        <InspectorSection
          title={isBusiness ? '관련 법령·검토 기준' : '관련 규정'}
        >
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800">
                    {isBusiness ? '출처 확인됨' : 'VERIFIED'}
                  </Badge>
                  <span className="text-xs text-emerald-800">
                    {source.authority}
                  </span>
                </div>
                <p className="text-sm font-semibold leading-5 text-slate-800">
                  {source.title}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  {[source.provision, source.heading]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {createExcerpt(source.text)}
                </p>
                <Collapsible className="mt-3 border-t border-emerald-100 pt-3">
                  <CollapsibleTrigger className="group flex w-full items-center text-left text-xs font-semibold text-emerald-800">
                    관련 원문 펼쳐보기
                    <ChevronDown className="ml-auto size-3.5 transition-transform group-data-panel-open:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 text-xs leading-5 text-slate-600">
                    <p>{source.text}</p>
                    {source.sourceUrl && (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-800"
                      >
                        공식 출처에서 확인 <ExternalLink className="size-3" />
                      </a>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
            {sources.length === 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <Badge className="bg-blue-100 text-blue-800">
                  REVIEW REQUIRED
                </Badge>
                <p className="mt-2 text-xs leading-5 text-blue-900">
                  검증된 공식 규정 청크를 연결하지 못했습니다. 확인되지 않은
                  법령명이나 조항은 표시하지 않습니다.
                </p>
              </div>
            )}
          </div>
        </InspectorSection>
        {enforcementCases.length > 0 && (
          <InspectorSection title="유사 식약처 적발 사례">
            <div className="space-y-3">
              {enforcementCases.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-amber-100 bg-amber-50/60 p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className="bg-amber-100 text-amber-800">
                      MFDS ENFORCEMENT EXAMPLE
                    </Badge>
                    <span className="text-xs text-amber-800">
                      {item.publishedAt}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    “{item.problematicExpression}”
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {item.description}
                  </p>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                  >
                    식약처 공식 자료 확인 <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
              <p className="text-xs leading-5 text-slate-500">
                유사 사례는 참고 정보이며, 위의 관련 규정을 대신하는 법적 근거가
                아닙니다.
              </p>
            </div>
          </InspectorSection>
        )}
        <InspectorSection
          title={isBusiness ? '권장 수정 문구' : 'Suggested Rewrite'}
        >
          <div className="space-y-2">
            {issue.suggestedRewrites.map((rewrite) => (
              <label
                key={rewrite}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selectedRewrite === rewrite ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <input
                  type="radio"
                  name={`rewrite-${issue.id}`}
                  value={rewrite}
                  checked={selectedRewrite === rewrite}
                  onChange={() => setSelectedRewrite(rewrite)}
                  className="mt-1 accent-indigo-600"
                />
                <span className="text-sm leading-6 text-slate-700">
                  {rewrite}
                </span>
              </label>
            ))}
          </div>
          <div
            className={`mt-3 grid gap-2 ${canApplyRewrite ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}
          >
            <Button
              variant="outline"
              size={canApplyRewrite ? 'icon' : 'default'}
              aria-label="수정안 복사"
              onClick={onCopy}
            >
              {copied ? <Check className="text-emerald-600" /> : <Copy />}
              {!canApplyRewrite && (copied ? '복사됨' : '선택한 수정안 복사')}
            </Button>
            {canApplyRewrite && (
              <Button
                onClick={onApplyRewrite}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                이 표현으로 교체 <ArrowRight />
              </Button>
            )}
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold tracking-[0.06em] text-slate-400 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function LowRiskResult({
  text,
  audience,
  onNewScan,
}: {
  text: string;
  audience: AnalysisAudience;
  onNewScan: () => void;
}) {
  const isBusiness = audience === 'BUSINESS';
  return (
    <Card className="border-0 py-0 shadow-[0_16px_50px_rgba(15,23,42,0.06)] ring-1 ring-emerald-200">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
        <span className="grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-8" />
        </span>
        <RiskBadge severity="LOW" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          높은 위험 표현이 발견되지 않았습니다
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
          {isBusiness
            ? '현재 지원 범위에서 우선 수정할 표현은 찾지 못했습니다. LOW는 적법 보장이 아니므로 제품 분류, 실제 거래조건, 보유 증빙과 최신 공식 규정을 게시 전에 확인하세요.'
            : '현재 적용 규칙과 공식 규정 검색 기준의 결과입니다. 실제 구매 전에는 제품 정보, 거래 조건과 공식 안내를 추가로 확인하세요.'}
        </p>
        <div className="mt-7 w-full max-w-2xl rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-base leading-7 text-slate-700">
          {text}
        </div>
        <Button
          variant="outline"
          className="mt-7 h-10 rounded-xl"
          onClick={onNewScan}
        >
          <Plus /> 다른 문구 검사
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewRequiredEmptyState({
  text,
  onNewScan,
}: {
  text: string;
  onNewScan: () => void;
}) {
  return (
    <Card className="border-0 py-0 shadow-[0_16px_50px_rgba(15,23,42,0.06)] ring-1 ring-blue-200">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
        <span className="grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Info className="size-8" />
        </span>
        <RiskBadge severity="REVIEW_REQUIRED" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          제품 분류를 먼저 확인해 주세요
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
          현재 지원 범위에서 제품 유형을 확정하지 못해 규정 근거가 없는 Issue를
          만들지 않았습니다. 제품 유형과 제품명·공식 품목 식별번호를 확인한 뒤
          다시 검사해 주세요.
        </p>
        <div className="mt-7 w-full max-w-2xl rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-base leading-7 text-slate-700">
          {text}
        </div>
        <Button
          variant="outline"
          className="mt-7 h-10 rounded-xl"
          onClick={onNewScan}
        >
          <Plus /> 다른 문구 검사
        </Button>
      </CardContent>
    </Card>
  );
}

function RiskBadge({
  severity,
  compact = false,
}: {
  severity: Severity;
  compact?: boolean;
}) {
  const config = {
    HIGH: {
      label: 'HIGH RISK',
      icon: TriangleAlert,
      className: 'border-red-200 bg-red-50 text-red-700',
    },
    MEDIUM: {
      label: 'MEDIUM RISK',
      icon: ShieldAlert,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    LOW: {
      label: 'LOW RISK',
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    REVIEW_REQUIRED: {
      label: 'REVIEW REQUIRED',
      icon: Info,
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  }[severity];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border font-semibold tracking-wide ${compact ? 'px-2 py-1 text-[10px]' : 'mt-4 px-3 py-1.5 text-xs'} ${config.className}`}
    >
      <Icon className={compact ? 'size-3' : 'size-3.5'} /> {config.label}
    </span>
  );
}

function buildRegulatedProductOptions(
  category: AnalysisCategory,
  productName: string,
  companyName: string,
  reportNumber: string,
) {
  if (category === 'AUTO') return undefined;
  const productIdentity = Object.fromEntries(
    Object.entries({ productName, companyName, reportNumber }).filter(
      ([, value]) => value.trim().length > 0,
    ),
  );
  return {
    categoryHint: category,
    ...(Object.keys(productIdentity).length > 0 && { productIdentity }),
  };
}

function getProductIdentityLabels(category: AnalysisCategory) {
  if (category === 'AUTO') return null;
  return {
    HEALTH_FUNCTIONAL_FOOD: {
      companyLabel: '제조업소명',
      numberLabel: '품목제조번호',
    },
    PHARMACEUTICAL: {
      companyLabel: '업체명',
      numberLabel: '품목기준코드',
    },
    MEDICAL_DEVICE: {
      companyLabel: '업체명',
      numberLabel: '품목허가·인증·신고번호',
    },
    COSMETIC: {
      companyLabel: '책임판매업자',
      numberLabel: '기능성 심사·보고번호',
    },
  }[category];
}

function getAuthorizationDisplay(
  category: ScanAnalysisResult['detectedCategory'],
) {
  const displays = {
    HEALTH_FUNCTIONAL_FOOD: {
      description:
        '식품안전나라 품목제조신고의 제품·주된 기능성·섭취조건을 기준으로 대조합니다.',
      companyLabel: '제조업소',
      numberLabel: '품목제조번호',
      scopeLabel: '신고된 주된 기능성',
      methodLabel: '섭취방법',
      sourceLinkLabel: '식품안전나라 API 기준 확인',
    },
    PHARMACEUTICAL: {
      description:
        '식약처 의약품 품목정보의 전문·일반 구분, 효능·효과와 용법·용량을 기준으로 대조합니다.',
      companyLabel: '업체명',
      numberLabel: '품목기준코드',
      scopeLabel: '허가된 효능·효과',
      methodLabel: '용법·용량',
      sourceLinkLabel: '식약처 의약품 품목정보 확인',
    },
    MEDICAL_DEVICE: {
      description:
        '식약처 의료기기 품목정보의 사용목적·성능과 사용방법을 기준으로 대조합니다.',
      companyLabel: '업체명',
      numberLabel: '품목허가·인증·신고번호',
      scopeLabel: '허가된 사용목적·성능',
      methodLabel: '사용방법',
      sourceLinkLabel: '식약처 의료기기 품목정보 확인',
    },
    COSMETIC: {
      description:
        '식약처 기능성화장품 심사·보고 품목정보의 기능성 범위를 기준으로 대조합니다.',
      companyLabel: '제조·책임판매업자',
      numberLabel: '기능성 심사·보고번호',
      scopeLabel: '기능성 심사·보고 범위',
      methodLabel: '사용방법',
      sourceLinkLabel: '식약처 기능성화장품 품목정보 확인',
    },
  } as const;
  return category in displays
    ? displays[category as keyof typeof displays]
    : displays.HEALTH_FUNCTIONAL_FOOD;
}

function splitKeyIssues(result: ScanAnalysisResult) {
  const ids =
    result.keyIssueIds.length > 0
      ? result.keyIssueIds
      : result.issues.slice(0, 3).map((issue) => issue.id);
  const keyIssues = ids
    .map((id) => result.issues.find((issue) => issue.id === id))
    .filter((issue): issue is Issue => Boolean(issue));
  const otherIssues = result.issues.filter((issue) => !ids.includes(issue.id));
  return { keyIssues, otherIssues };
}

function formatAnalysisModel(result: ScanAnalysisResult) {
  const model = result.analysisModel ?? '';
  if (result.metrics?.mode === 'offline' || model === 'rules-only')
    return '규칙 기반 결과 · AI 미사용';
  if (model.includes(' + ')) return `AI 분석 · ${model} (대체 제공자 포함)`;
  if (model.startsWith('openai/'))
    return `AI 분석 · ${model.slice('openai/'.length)} (대체 제공자)`;
  if (model.startsWith('vertex/'))
    return `AI 분석 · Vertex AI ${model.slice('vertex/'.length)}`;
  return `AI 분석 · ${model}`;
}

function formatElapsed(result: ScanAnalysisResult) {
  const ms = result.metrics?.elapsedMs;
  if (ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}초`;
}

function createExcerpt(text: string) {
  return text.length > 96 ? `${text.slice(0, 96).trim()}…` : text;
}

function getUrlValidationError(value: string) {
  if (!value.trim()) return null;
  if (value.length > 2048) return 'URL은 2,048자 이하로 입력해 주세요.';
  try {
    validatePublicHttpUrl(value);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : '올바른 웹사이트 URL을 입력해 주세요.';
  }
}

function formatContentType(type: ScanAnalysisResult['detectedContentType']) {
  return {
    ADVERTISEMENT_TEXT: 'Advertisement Text',
    LANDING_PAGE: 'Landing Page',
    PRODUCT_DETAIL: 'Product Detail',
    BLOG: 'Blog',
    DOCUMENTATION: 'Documentation',
    UNKNOWN: 'Unknown',
  }[type];
}

function formatCategory(category: ScanAnalysisResult['detectedCategory']) {
  return {
    GENERAL_ADVERTISING: 'General Advertising',
    GENERAL_FOOD: 'General Food',
    HEALTH_FUNCTIONAL_FOOD: 'Health Functional Food',
    PHARMACEUTICAL: 'Pharmaceutical',
    MEDICAL_DEVICE: 'Medical Device',
    COSMETIC: 'Cosmetic',
    UNKNOWN: 'Review Required',
  }[category];
}

function formatPack(packId: Issue['packId']) {
  return {
    GENERAL_ADVERTISING: 'General Advertising',
    GENERAL_FOOD: 'General Food',
    HEALTH_FUNCTIONAL_FOOD: 'Health Functional Food',
    PHARMACEUTICAL: 'Pharmaceutical',
    MEDICAL_DEVICE: 'Medical Device',
    COSMETIC: 'Cosmetic',
  }[packId];
}

function formatResolutionType(resolutionType: Issue['resolutionType']) {
  return {
    REMOVE_OR_REWRITE: '효능 표현을 제거하거나 제품 정보 중심으로 수정',
    VERIFY_PRODUCT_CLASSIFICATION: '제품 분류·품목 허가정보를 먼저 확인',
    PROVIDE_EVIDENCE: '표현과 직접 연결되는 객관적 근거 확인',
    HUMAN_REVIEW: '전체 맥락을 포함한 추가 검토',
  }[resolutionType];
}

function formatPrimaryLegalBasis(issue: Issue, result: ScanAnalysisResult) {
  const source = result.sources.find((candidate) =>
    issue.regulationSourceIds.includes(candidate.id),
  );
  if (!source) return null;
  const provision = [source.provision, source.heading]
    .filter(Boolean)
    .join(' · ');
  return `${source.shortTitle ?? source.title}${provision ? ` · ${provision}` : ''}`;
}

function getBusinessActionDetail(issue: Issue) {
  return {
    REMOVE_OR_REWRITE:
      '현재 표현은 근거를 덧붙이는 것만으로 위험이 충분히 줄지 않을 수 있습니다. 게시 전 해당 효능·오인 표현을 제거하거나 확인된 제품 정보 중심으로 바꾸세요.',
    VERIFY_PRODUCT_CLASSIFICATION:
      '적용 법령이 제품 분류에 따라 달라질 수 있습니다. 품목 유형과 인허가 상태를 먼저 확인한 뒤 문구를 확정하세요.',
    PROVIDE_EVIDENCE:
      '주장과 직접 관련된 객관적 자료를 게시 전에 확보하세요. 자료가 없거나 조건이 광고 문구와 다르면 수치·우월·보장 표현을 완화하거나 제거하세요.',
    HUMAN_REVIEW:
      '텍스트만으로 전체 맥락을 확인하기 어렵습니다. 이미지, 배치, 각주와 거래조건을 포함해 담당자 또는 전문가가 최종 검토하세요.',
  }[issue.resolutionType];
}

function formatIssueType(issueType: string) {
  return (
    {
      DISEASE_PREVENTION_TREATMENT: '질병 예방·치료 표현',
      HEALTH_FUNCTIONAL_FOOD_CONFUSION: '건강기능식품 오인 우려',
      PHARMACEUTICAL_CONFUSION: '의약품 오인 우려',
      FALSE_EXAGGERATED_CLAIM: '거짓·과장 표현',
      CONSUMER_EXPERIENCE_GENERALIZATION: '체험담 일반화',
      BEFORE_AFTER_RISK: '전후 비교 맥락',
      EXPERT_ENDORSEMENT_RISK: '전문가 권위 표현',
      EVIDENCE_REQUIRED: '객관적 근거 필요',
      COMPARATIVE_CLAIM: '비교·우월 표현',
      CONDITION_DISCLOSURE: '조건 표시 확인',
      PRODUCT_AUTHORIZATION_NOT_VERIFIED: '제품 허가정보 확인 필요',
      OUTSIDE_AUTHORIZED_FUNCTIONALITY: '허가 기능성 범위 밖 표현',
      AUTHORIZED_FUNCTIONALITY_OVERSTATEMENT: '허가 기능성 과장 표현',
      AUTHORIZATION_SCOPE_CLAIM: '허가 효능·성능 범위 표현',
      ABSOLUTE_SAFETY_OR_EFFECT_CLAIM: '효과·안전성 절대 표현',
      BEFORE_AFTER_OR_TESTIMONIAL_RISK: '전후 비교·체험담 표현',
      PHARMACEUTICAL_MISRECOGNITION: '의약품 오인 우려',
      OBJECTIVE_EFFECT_CLAIM: '객관적 효능 실증 필요',
      PRESCRIPTION_DRUG_PUBLIC_ADVERTISING: '전문의약품 대중광고 제한',
      OUTSIDE_AUTHORIZED_SCOPE: '허가·심사 범위 밖 표현',
      AUTHORIZATION_SCOPE_REQUIRES_REVIEW: '허가범위 원문 확인 필요',
      AUTHORIZED_SCOPE_OVERSTATEMENT: '허가범위보다 강한 표현',
    }[issueType] ?? issueType.replaceAll('_', ' ')
  );
}

function formatSectionType(type: PageSection['type']) {
  return {
    HERO: 'Hero',
    HEADING: 'Heading',
    PARAGRAPH: 'Content',
    CTA: 'CTA',
    FEATURE: 'Features',
    PRICING: 'Pricing',
    TESTIMONIAL: 'Testimonials',
    COMPARISON: 'Comparison',
    FAQ: 'FAQ',
    IMAGE_ALT: 'Image',
    META_DESCRIPTION: 'Meta',
  }[type];
}

function getIssueHighlightClass(severity: Severity, active: boolean) {
  if (severity === 'HIGH') {
    return active
      ? 'bg-red-100 text-red-900 decoration-red-500 ring-2 ring-red-200'
      : 'bg-red-50 text-red-800 decoration-red-400 hover:bg-red-100';
  }
  if (severity === 'MEDIUM') {
    return active
      ? 'bg-amber-100 text-amber-900 decoration-amber-500 ring-2 ring-amber-200'
      : 'bg-amber-50 text-amber-800 decoration-amber-400 hover:bg-amber-100';
  }
  return active
    ? 'bg-blue-100 text-blue-900 decoration-blue-500 ring-2 ring-blue-200'
    : 'bg-blue-50 text-blue-800 decoration-blue-400 hover:bg-blue-100';
}

function RetrievalDebugPanel({
  debug,
}: {
  debug: NonNullable<ScanAnalysisResult['debug']>;
}) {
  return (
    <details className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold text-slate-700">
        Development · Retrieval debug
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
          {JSON.stringify(
            { queries: debug.queries, retrieved: debug.retrieved },
            null,
            2,
          )}
        </pre>
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
          {JSON.stringify(
            {
              selected: debug.selectedSourceChunkIds,
              rejected: debug.rejectedCitations,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </details>
  );
}
