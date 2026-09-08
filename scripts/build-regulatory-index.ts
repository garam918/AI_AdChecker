import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { loadEnv } from 'vite';
import { buildRegulationIndex } from '@/src/compliance/regulatory/regulation-index-builder';
import { RegulationSearchIndexSchema } from '@/src/compliance/regulatory/regulation-search-index';
import { createEmbeddingProviderFromEnv } from '@/src/server/rag-embedding-provider';

const outputPath = 'data/regulations/processed/rag-index.json';
const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (
  args.some((arg) => !['--embed', '--check'].includes(arg)) ||
  (args.includes('--embed') && args.includes('--check'))
) {
  throw new Error('사용법: npm run rag:index -- [--embed | --check]');
}
const files = (await readdir('data/regulations/raw'))
  .filter((file) => file.endsWith('.json'))
  .sort();
const sources = await Promise.all(
  files.map(async (file) => {
    const path = `data/regulations/raw/${file}`;
    return {
      path,
      corpus: JSON.parse(await readFile(path, 'utf8')) as unknown,
    };
  }),
);
let previous = null;
try {
  previous = RegulationSearchIndexSchema.parse(
    JSON.parse(await readFile(outputPath, 'utf8')),
  );
} catch (error) {
  if (
    !(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
  )
    throw error;
}
const provider = args.includes('--embed')
  ? createEmbeddingProviderFromEnv({
      ...loadEnv('development', process.cwd(), ''),
      ...process.env,
    })
  : null;
if (args.includes('--embed') && !provider) {
  throw new Error(
    'RAG_EMBEDDING_PROVIDER를 openai 또는 ollama로 설정한 뒤 다시 실행해 주세요.',
  );
}
const index = await buildRegulationIndex(sources, { provider, previous });
if (args.includes('--check')) {
  const {
    embedding: _embedding,
    entries: _entries,
    ...metadata
  } = previous ?? {};
  const comparable = previous && {
    ...metadata,
    embedding: null,
    entries: previous.entries.map((entry) => ({ ...entry, embedding: null })),
  };
  if (JSON.stringify(comparable) !== JSON.stringify(index)) {
    throw new Error(
      '법령 인덱스가 원본과 일치하지 않습니다. npm run rag:index로 재생성해 주세요.',
    );
  }
  console.log(
    `RAG 인덱스 최신 상태: ${index.documents.length}개 문서 / ${index.chunks.length}개 조항`,
  );
} else {
  // A lexical rebuild must never silently discard an existing semantic index.
  if (!provider && previous?.embedding) {
    throw new Error(
      '기존 벡터 인덱스를 유지하려면 동일한 모델을 설정하고 --embed로 재생성해 주세요.',
    );
  }
  await mkdir('data/regulations/processed', { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  console.log(
    `RAG 인덱스 생성: ${index.documents.length}개 문서 / ${index.chunks.length}개 조항 / ${index.embedding ? `${index.embedding.provider}:${index.embedding.model}` : 'BM25 (임베딩 미설정)'}`,
  );
}
