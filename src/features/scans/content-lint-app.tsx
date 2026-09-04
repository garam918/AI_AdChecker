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
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  FileImage,
  Gauge,
  Globe2,
  History,
  Info,
  LoaderCircle,
  PlaySquare,
  Plus,
  RefreshCw,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { z } from 'zod';

import { analyzeContent } from '@/src/ai/analyze-content';
import type {
  Issue,
  ScanAnalysisResult,
  Severity,
} from '@/src/compliance/core/schemas';
import { SAFE_DEMO_REWRITE } from '@/src/compliance/packs/general-advertising/demo-data';
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

const progressStages = [
  '콘텐츠 분석',
  'Claim 추출',
  '적용 규정 탐색',
  '위험 요소 평가',
  '리포트 생성',
] as const;

const webMcpInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

type View = 'dashboard' | 'new-scan' | 'progress' | 'result';

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
  const [analyzedText, setAnalyzedText] = useState('');
  const [result, setResult] = useState<ScanAnalysisResult | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [selectedRewrite, setSelectedRewrite] = useState('');
  const [progressStage, setProgressStage] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const activeIssue = useMemo(
    () => result?.issues.find((issue) => issue.id === activeIssueId) ?? null,
    [activeIssueId, result],
  );

  const runAnalysis = useCallback(async (value: string) => {
    const normalizedText = value.trim();
    if (!normalizedText) return;

    setAnalyzedText(normalizedText);
    setInputText(normalizedText);
    setAnalysisError(null);
    setDraftNotice(null);
    setProgressStage(0);
    setView('progress');

    try {
      const pendingResult = analyzeContent(normalizedText);

      for (let index = 0; index < progressStages.length; index += 1) {
        setProgressStage(index);
        await delay(320);
      }

      const nextResult = await pendingResult;
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
  }, []);

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
                  maxLength: 2000,
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
    setInputText(SAFE_DEMO_REWRITE);
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
            General Advertising
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          {view === 'dashboard' && (
            <Dashboard
              onStart={() => setView('new-scan')}
              onUseDemo={() => {
                setInputText(DEMO_TEXT);
                setView('new-scan');
              }}
            />
          )}
          {view === 'new-scan' && (
            <NewScan
              text={inputText}
              setText={setInputText}
              onAnalyze={() => void runAnalysis(inputText)}
            />
          )}
          {view === 'progress' && (
            <AnalysisProgress
              activeStage={progressStage}
              error={analysisError}
              onRetry={() => void runAnalysis(inputText)}
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
              onRescan={() => void runAnalysis(inputText)}
              onNewScan={() => {
                setInputText('');
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
  onUseDemo,
}: {
  onStart: () => void;
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
          title="Text / Image"
          description="광고 문구를 입력하고 위험 표현과 수정안을 확인합니다."
          onClick={onStart}
          active
        />
        <ScanCard
          eyebrow="Coming soon"
          icon={Globe2}
          title="Website / Product Page"
          description="URL에서 보이는 광고 표현을 추출해 검사합니다."
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
  text,
  setText,
  onAnalyze,
}: {
  text: string;
  setText: (value: string) => void;
  onAnalyze: () => void;
}) {
  const tooLong = text.length > 2000;
  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-sm font-medium text-indigo-600">New analysis</p>
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[34px]">
        새 콘텐츠 검사
      </h1>
      <p className="mt-3 text-base leading-7 text-slate-500">
        게시하려는 문구를 입력하면 문제 구간과 수정 방향을 정리합니다.
      </p>
      <Card className="mt-8 gap-0 border-0 py-0 shadow-[0_10px_35px_rgba(15,23,42,0.05)] ring-1 ring-slate-200">
        <Tabs defaultValue="text">
          <TabsList
            variant="line"
            className="h-14 w-full justify-start gap-6 border-b border-slate-200 px-6"
          >
            <TabsTrigger value="url" disabled>
              URL
            </TabsTrigger>
            <TabsTrigger value="youtube" disabled>
              YouTube
            </TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="media" disabled>
              Image / Video
            </TabsTrigger>
          </TabsList>
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
                <Sparkles /> Demo Example
              </Button>
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
                  ? '2,000자 이하로 입력해 주세요.'
                  : '한국어 광고 문구 · General Advertising'}
              </span>
              <span
                className={
                  tooLong ? 'font-medium text-red-600' : 'text-slate-400'
                }
              >
                {text.length} / 2,000
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
        현재 MVP는 광고 텍스트 검사를 지원합니다. 이미지와 동영상 검사는 준비
        중입니다.
      </div>
    </div>
  );
}

function AnalysisProgress({
  activeStage,
  error,
  onRetry,
  onBack,
}: {
  activeStage: number;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const progress = ((activeStage + 1) / progressStages.length) * 100;
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
            {error ?? '표현을 나누고 관련 검토 기준과 위험 요소를 확인합니다.'}
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
                {progressStages.map((stage, index) => {
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
  return (
    <div className="space-y-6">
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
            검사 결과
          </h1>
          <p className="mt-2 text-base text-slate-500">
            {isLow
              ? '현재 데모 규칙에서 높은 위험 표현이 발견되지 않았습니다.'
              : '게시 전에 확인이 필요한 표현을 찾았습니다.'}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          onClick={onNewScan}
        >
          <Plus /> 새 검사
        </Button>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric
          label="Detected"
          value="General Advertising"
          icon={ScanText}
        />
        <SummaryMetric
          label="Overall Risk"
          value={<RiskBadge severity={result.overallRisk} />}
          icon={ShieldAlert}
        />
        <SummaryMetric
          label="Findings"
          value={`${result.issues.length} Risks Found`}
          icon={Clipboard}
        />
      </section>
      {isLow ? (
        <LowRiskResult text={analyzedText} onNewScan={onNewScan} />
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
                  발견된 위험
                </h2>
                <span className="text-sm text-slate-500">
                  {result.issues.length}개
                </span>
              </div>
              <div className="space-y-3">
                {result.issues.map((issue, index) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => onSelectIssue(issue)}
                    className={`flex w-full items-start gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm transition ${activeIssue?.id === issue.id ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 hover:border-slate-300'}`}
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
                    </span>
                    <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
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
            />
          )}
        </div>
      )}
    </div>
  );
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
}: {
  issue: Issue;
  result: ScanAnalysisResult;
  selectedRewrite: string;
  setSelectedRewrite: (rewrite: string) => void;
  onApplyRewrite: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const sources = result.sources.filter((source) =>
    issue.regulationSourceIds.includes(source.id),
  );
  return (
    <aside className="sticky top-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950">Issue Inspector</h2>
          <RiskBadge severity={issue.severity} compact />
        </div>
      </div>
      <div className="max-h-[calc(100vh-11rem)] space-y-6 overflow-y-auto px-5 py-5">
        <InspectorSection title="Original Claim">
          <p className="rounded-xl bg-red-50 px-4 py-3 font-medium leading-6 text-red-900">
            “{issue.originalText}”
          </p>
        </InspectorSection>
        <InspectorSection title="Reason">
          <p className="text-sm leading-6 text-slate-600">
            {issue.explanation}
          </p>
        </InspectorSection>
        <InspectorSection title="Required Evidence">
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
        <InspectorSection title="Related Regulation">
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800">DEMO DATA</Badge>
                  <span className="text-xs text-blue-700">
                    공식 법령 미연결
                  </span>
                </div>
                <p className="text-sm font-semibold leading-5 text-slate-800">
                  {source.title}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {source.text}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  조항 번호를 제공하지 않는 데모 검토 기준입니다.
                </p>
              </div>
            ))}
          </div>
        </InspectorSection>
        <InspectorSection title="Suggested Rewrite">
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
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="수정안 복사"
              onClick={onCopy}
            >
              {copied ? <Check className="text-emerald-600" /> : <Copy />}
            </Button>
            <Button
              onClick={onApplyRewrite}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              이 표현으로 교체 <ArrowRight />
            </Button>
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
  onNewScan,
}: {
  text: string;
  onNewScan: () => void;
}) {
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
          현재 데모 규칙 기준의 결과입니다. 실제 게시 전에는 제품 특성, 근거
          자료, 최신 공식 규정을 추가로 확인하세요.
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

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
