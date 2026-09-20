import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.resolve('public/marketing-assets');
const W = 1600;
const H = 900;
const font = "'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif";

const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const t = (
  x,
  y,
  text,
  size = 16,
  fill = '#17213d',
  weight = 400,
  anchor = 'start',
) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}px" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="hanging">${esc(text)}</text>`;

const r = (x, y, w, h, fill, radius = 14, stroke = 'none', sw = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

const line = (x1, y1, x2, y2, stroke = '#e7eaf2', sw = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;

const logo = (x, y, scale = 1, dark = false) => {
  const s = 22 * scale;
  return [
    r(x, y, s, s, '#2e9eff', 5 * scale),
    r(x + s * 1.16, y, s * 0.84, s * 0.84, '#0c79d8', 5 * scale),
    r(x, y + s * 1.16, s * 0.84, s * 0.84, '#0c79d8', 5 * scale),
    r(x + s * 1.16, y + s * 1.16, s, s, '#68c4ff', 5 * scale),
    t(
      x + s * 2.55,
      y + s * 0.08,
      'ContentLint AI',
      18 * scale,
      dark ? '#ffffff' : '#16213d',
      700,
    ),
  ].join('');
};

const browserFrame = (content, url = 'contentlint-ai.garam918.workers.dev') => `
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#18234d" flood-opacity=".16"/>
    </filter>
    <clipPath id="screenClip"><rect x="70" y="104" width="1460" height="746" rx="0"/></clipPath>
  </defs>
  ${r(70, 50, 1460, 800, '#ffffff', 24, '#dfe4f0', 1)}
  <rect x="70" y="50" width="1460" height="54" rx="24" fill="#f5f6fa"/>
  <rect x="70" y="80" width="1460" height="24" fill="#f5f6fa"/>
  <circle cx="98" cy="77" r="7" fill="#ff5f57"/><circle cx="122" cy="77" r="7" fill="#ffbd2e"/><circle cx="146" cy="77" r="7" fill="#28c840"/>
  ${r(205, 64, 860, 27, '#ffffff', 13, '#e6e8ef', 1)}
  ${t(225, 69, url, 12, '#667085', 500)}
  ${t(1488, 67, '•••', 17, '#9aa1b2', 700, 'end')}
  <g clip-path="url(#screenClip)">${content}</g>`;

const sidebar = (active = '새 검사') => `
  <rect x="70" y="104" width="250" height="746" fill="#ffffff"/>
  ${line(320, 104, 320, 850, '#e7eaf2', 1)}
  ${logo(96, 132, 0.63)}
  ${t(96, 198, '작업 공간', 13, '#8b93a5', 600)}
  ${t(116, 239, '◷', 18, '#536078', 500)}${t(143, 239, '시작하기', 15, '#485268', 500)}
  ${active === '새 검사' ? r(90, 275, 220, 40, '#f0efff', 20) : ''}
  ${t(116, 285, '+', 20, '#5d47e8', 500)}${t(143, 287, '새 검사', 15, active === '새 검사' ? '#4d3bd7' : '#485268', 600)}
  ${t(116, 333, '◴', 18, '#536078', 500)}${t(143, 335, '저장한 검사', 15, '#485268', 500)}
  ${r(89, 768, 222, 58, '#f8f9fc', 15)}
  ${t(105, 782, '게시 전 위험 점검', 12, '#4b556c', 700)}
  ${t(105, 802, '법률 자문이 아닌 사전 위험 점검 도구입니다.', 10, '#7d879a', 400)}
`;

const topbar = (crumb = '새 검사') => `
  ${line(320, 150, 1530, 150, '#edf0f5', 1)}
  ${t(350, 120, '작업 공간  /  ' + crumb, 14, '#7a8295', 500)}
  ${r(1338, 118, 160, 30, '#ffffff', 16, '#e5e8ef', 1)}
  ${circle(1354, 133, 4, '#37a66f')}${t(1367, 124, '사전검수 · 법률 자문 아님', 11, '#697287', 500)}
`;

const circle = (cx, cy, radius, fill, stroke = 'none') =>
  `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}"/>`;

const pill = (x, y, label, fill = '#f6f6ff', color = '#5946dd', w = null) => {
  const width = w ?? label.length * 10 + 30;
  return `${r(x, y, width, 28, fill, 14, fill === '#ffffff' ? '#e6e8ef' : 'none', 1)}${t(x + width / 2, y + 7, label, 12, color, 600, 'middle')}`;
};

const card = (x, y, w, h, title, body, accent = '#5e48e8') => `
  ${r(x, y, w, h, '#ffffff', 18, '#e7eaf2', 1)}
  ${r(x + 20, y + 20, 6, h - 40, accent, 3)}
  ${t(x + 44, y + 20, title, 15, '#2b3550', 700)}
  ${t(x + 44, y + 49, body, 13, '#69748a', 400)}
`;

const inputScreen = () => {
  const main = `
    ${sidebar('새 검사')}${topbar('새 검사')}
    ${t(365, 190, '게시 전 사전검수', 14, '#5e48e8', 600)}
    ${t(365, 218, '새 콘텐츠 검사', 30, '#17213d', 800)}
    ${t(365, 263, '웹페이지 주소, 광고 문구 또는 이미지를 입력하면 문제 구간과 수정 방향을 정리합니다.', 15, '#7c8496', 400)}
    ${r(365, 310, 1095, 430, '#ffffff', 20, '#e2e6ef', 1)}
    ${t(390, 336, '▾ 분석 설정 · 기업·판매자용 · 제품 유형 자동 감지', 14, '#4f596f', 600)}
    ${line(365, 378, 1460, 378)}
    ${t(400, 405, '검사 목적', 14, '#465169', 700)}
    ${t(400, 430, '분석 기준과 위험도는 동일하며, 선택한 목적에 맞게 결과와 조치 방법을 보여드립니다.', 12, '#81899a', 400)}
    ${r(400, 468, 490, 70, '#ffffff', 16, '#e4e7ef', 1)}
    ${circle(430, 503, 13, '#f2f3f8')}${t(455, 486, '광고를 보는 소비자', 14, '#354057', 700)}${t(455, 511, '주의할 표현과 구매 전 확인할 정보를 봅니다.', 11, '#7a8498', 400)}
    ${r(915, 468, 490, 70, '#f6f4ff', 16, '#b9afff', 1)}
    ${circle(945, 503, 13, '#6149e8')}${t(970, 486, '광고를 만드는 기업·판매자', 14, '#354057', 700)}${t(970, 511, '관련 법령, 수정안과 필요한 증빙을 봅니다.', 11, '#7a8498', 400)}
    ${line(365, 562, 1460, 562)}
    ${t(520, 580, '광고 문구', 14, '#25304a', 700)}${t(890, 580, '웹페이지', 14, '#8b93a4', 500)}${t(1245, 580, '이미지', 14, '#8b93a4', 500)}
    ${line(365, 610, 730, 610, '#22283d', 2)}
    ${t(400, 638, '광고 문구', 14, '#465169', 700)}${t(1220, 638, '예제를 선택하거나 직접 입력하세요', 12, '#8b93a4', 400)}
    ${pill(400, 674, 'SaaS · 수치·최상급', '#ffffff', '#657089', 156)}${pill(566, 674, '식품 · 혈당·면역 표현', '#ffffff', '#657089', 168)}${pill(744, 674, '식품 · 감기 예방 표현', '#ffffff', '#657089', 170)}
    ${r(400, 722, 1005, 112, '#fbfcfe', 15, '#e2e6ef', 1)}
    ${t(420, 744, '검사할 광고 문구를 입력하세요.', 14, '#9aa3b3', 400)}
    ${t(1382, 812, '0 / 20,000', 11, '#8b93a4', 400, 'end')}
    ${r(1232, 854, 174, 36, '#9a8bef', 18)}${t(1319, 863, '✦ AI 분석 시작', 13, '#ffffff', 700, 'middle')}
  `;
  return `<rect width="${W}" height="${H}" fill="#f7f8fb"/>${browserFrame(main)}`;
};

const progressScreen = () => {
  const main = `
    ${sidebar('새 검사')}${topbar('분석 중')}
    ${t(365, 250, '콘텐츠를 검사하고 있습니다', 30, '#17213d', 800)}
    ${t(365, 300, '광고 문맥과 공식 근거를 대조하고 있습니다.', 15, '#7b8497', 400)}
    ${t(365, 324, '완료하지 못한 분석은 완료된 것처럼 표시하지 않습니다.', 15, '#7b8497', 400)}
    ${r(365, 380, 1095, 335, '#ffffff', 22, '#e2e6ef', 1)}
    ${t(405, 410, '3 / 5 단계', 15, '#5c49df', 700)}${t(1450, 410, '경과 4초', 13, '#8b93a4', 500, 'end')}
    ${r(405, 450, 1015, 10, '#ecebff', 5)}${r(405, 450, 610, 10, '#6d58ed', 5)}
    ${[0, 1, 2, 3, 4]
      .map((i) => {
        const x = 430 + i * 210;
        const active = i === 2;
        const done = i < 2;
        return `${circle(x, 525, 16, done ? '#6d58ed' : active ? '#ffffff' : '#f1f2f6', done || active ? '#6d58ed' : '#e0e3eb')}${done ? t(x, 516, '✓', 13, '#ffffff', 700, 'middle') : active ? circle(x, 525, 5, '#6d58ed') : ''}`;
      })
      .join('')}
    ${line(446, 525, 624, 525, '#6d58ed', 4)}${line(656, 525, 834, 525, '#6d58ed', 4)}${line(866, 525, 1044, 525, '#e5e7ef', 4)}${line(1076, 525, 1254, 525, '#e5e7ef', 4)}
    ${t(430, 566, '콘텐츠 준비', 13, '#3b455b', 700)}${t(640, 566, '문맥 분류 · 주장 추출', 13, '#3b455b', 700)}${t(850, 566, '공식 규정 검색', 13, '#3b455b', 700)}${t(1060, 566, 'AI 위험 해석', 13, '#8891a2', 500)}${t(1270, 566, '결과 정리', 13, '#8891a2', 500)}
    ${r(405, 625, 1015, 52, '#fafaff', 15)}${circle(432, 651, 7, '#6d58ed')}${t(452, 638, '관련 공식 규정을 검색하고 있습니다', 13, '#5d667c', 600)}
    ${r(1160, 780, 246, 42, '#ffffff', 21, '#e2e6ef', 1)}${t(1283, 792, '대기 중단 · 입력으로 돌아가기', 12, '#68728a', 600, 'middle')}
  `;
  return `<rect width="${W}" height="${H}" fill="#f7f8fb"/>${browserFrame(main)}`;
};

const resultScreen = () => {
  const main = `
    ${sidebar('새 검사')}${topbar('검사 결과')}
    ${t(365, 190, '결과', 14, '#5e48e8', 600)}
    ${t(365, 218, '확인할 표현 2개', 30, '#17213d', 800)}
    ${t(365, 262, '게시 전에 조치가 필요한 표현과 관련 검토 기준을 정리했습니다.', 14, '#7c8496', 400)}
    ${pill(365, 300, '높은 위험', '#fff1f1', '#b23a45', 92)}${pill(470, 300, '일반 광고', '#f6f6ff', '#5946dd', 92)}${t(580, 307, '분석 9.1초 · 공식 근거 대조', 12, '#8a93a5', 500)}
    ${r(365, 360, 1095, 72, '#ffffff', 16, '#e2e6ef', 1)}
    ${t(395, 383, '검토 작업 순서', 13, '#8a93a5', 700)}${t(590, 383, '1. 확인할 표현 2개', 13, '#4d3bd7', 700)}${t(830, 383, '2. 수정 방향 선택', 13, '#4d3bd7', 700)}${t(1068, 383, '3. 초안 확인 · 재검사', 13, '#4d3bd7', 700)}
    ${t(365, 480, '핵심 이슈', 20, '#27324b', 800)}${t(525, 486, '우선 확인', 12, '#8a93a5', 500)}${pill(605, 477, '2개', '#f2efff', '#5e48e8', 58)}
    ${card(365, 530, 1095, 102, '“업무 시간을 70% 줄여주는”', '업무 시간 단축 수치는 객관적이고 타당한 실증 자료가 요구될 수 있습니다.', '#e34f5f')}
    ${pill(1360, 548, '높은 위험', '#fff1f1', '#b23a45', 80)}${t(409, 601, '다음 행동 · 주장의 근거를 확인하거나 표현 수정', 12, '#6d768a', 500)}
    ${card(365, 655, 1095, 102, '“국내 최고의”', '비교 대상과 명확한 기준 없이 배타적 우위를 주장하면 위험이 발생할 수 있습니다.', '#e34f5f')}
    ${pill(1360, 673, '높은 위험', '#fff1f1', '#b23a45', 80)}${t(409, 726, '다음 행동 · 비교 기준을 확인하거나 표현 수정', 12, '#6d768a', 500)}
  `;
  return `<rect width="${W}" height="${H}" fill="#f7f8fb"/>${browserFrame(main)}`;
};

const inspectorScreen = () => {
  const main = `
    ${sidebar('새 검사')}${topbar('검사 결과')}
    ${t(365, 188, '이슈 상세 · 수정하기', 24, '#17213d', 800)}
    ${pill(365, 235, '높은 위험', '#fff1f1', '#b23a45', 92)}${pill(470, 235, '객관적 근거 필요', '#fff8e8', '#9a6900', 128)}${pill(608, 235, '일반 광고', '#f6f6ff', '#5946dd', 92)}
    ${r(365, 294, 1095, 432, '#ffffff', 20, '#e2e6ef', 1)}
    ${t(405, 326, '문제가 될 수 있는 표현', 15, '#465169', 700)}
    ${r(405, 362, 1015, 62, '#fff8f8', 15, '#ffd9dc', 1)}${t(435, 383, '“업무 시간을 70% 줄여주는”', 24, '#b23a45', 700)}
    ${t(405, 460, '확인해야 하는 이유', 15, '#465169', 700)}
    ${t(405, 495, '업무 시간 단축 수치는 사실과 관련한 사항에 해당하여', 14, '#657089', 400)}
    ${t(405, 520, '객관적이고 타당한 실증 자료가 요구될 수 있습니다.', 14, '#657089', 400)}
    ${t(405, 577, '수정 방향', 15, '#465169', 700)}
    ${r(405, 610, 492, 70, '#f7f6ff', 15, '#cfc8ff', 1)}${circle(432, 645, 10, '#6d58ed')}${t(455, 628, '문구 수정 제안', 14, '#38425a', 700)}${t(455, 652, '사실을 새로 추가하지 않고 더 안전하게 표현합니다.', 11, '#7b8497', 400)}
    ${r(928, 610, 492, 70, '#ffffff', 15, '#e3e6ee', 1)}${circle(955, 645, 10, '#ffffff', '#aeb6c6')}${t(978, 628, '이 표현 삭제', 14, '#38425a', 700)}${t(978, 652, '검토 대상 표현만 제거합니다.', 11, '#7b8497', 400)}
    ${r(405, 695, 1015, 52, '#fafaff', 14)}${t(430, 713, '증빙·직접 검토가 필요한 제안 1개', 13, '#5d667c', 600)}${t(1380, 713, '›', 20, '#5e48e8', 600, 'end')}
    ${t(365, 777, '관련 법령·검토 기준', 18, '#27324b', 800)}
    ${r(365, 814, 1095, 40, '#ffffff', 13, '#e2e6ef', 1)}${t(388, 827, '공정거래위원회 표시·광고의 공정화에 관한 법률 제5조 제1항', 12, '#52617a', 600)}
  `;
  return `<rect width="${W}" height="${H}" fill="#f7f8fb"/>${browserFrame(main)}`;
};

const inputTypesScreen = () => {
  const main = `
    ${sidebar('새 검사')}${topbar('새 검사')}
    ${t(365, 190, '입력 방식', 14, '#5e48e8', 600)}${t(365, 218, '문구·웹페이지·이미지', 30, '#17213d', 800)}
    ${t(365, 263, '콘텐츠가 있는 곳에서 바로 가져와 게시 전 위험을 확인하세요.', 15, '#7c8496', 400)}
    ${r(365, 326, 335, 365, '#ffffff', 20, '#e2e6ef', 1)}${r(395, 356, 52, 52, '#f0efff', 16)}${t(421, 372, 'T', 23, '#5e48e8', 800, 'middle')}${t(395, 440, '광고 문구', 19, '#27324b', 800)}${t(395, 476, '수치·최상급·효능·비교 표현을', 13, '#758096', 400)}${t(395, 499, '문장 단위로 점검합니다.', 13, '#758096', 400)}${pill(395, 588, '한국어 텍스트', '#f6f6ff', '#5946dd', 102)}
    ${r(730, 326, 335, 365, '#ffffff', 20, '#e2e6ef', 1)}${r(760, 356, 52, 52, '#ecf8f7', 16)}${t(786, 371, '↗', 24, '#238f80', 800, 'middle')}${t(760, 440, '웹페이지 주소', 19, '#27324b', 800)}${t(760, 476, '공개 페이지의 본문·제목·대체', 13, '#758096', 400)}${t(760, 499, '설명을 안전하게 추출합니다.', 13, '#758096', 400)}${pill(760, 588, 'URL 분석', '#eefaf8', '#238f80', 84)}
    ${r(1095, 326, 335, 365, '#ffffff', 20, '#e2e6ef', 1)}${r(1125, 356, 52, 52, '#fff7e8', 16)}${t(1151, 372, '▧', 22, '#ae7700', 800, 'middle')}${t(1125, 440, '이미지 업로드', 19, '#27324b', 800)}${t(1125, 476, '이미지 속 문구와 시각 표현을', 13, '#758096', 400)}${t(1125, 499, '함께 검토합니다.', 13, '#758096', 400)}${pill(1125, 588, 'OCR · 시각 이해', '#fff7e8', '#ae7700', 120)}
    ${r(365, 748, 1065, 70, '#f3f1ff', 18)}${circle(400, 783, 14, '#6d58ed')}${t(400, 777, '✓', 13, '#ffffff', 800, 'middle')}${t(430, 768, '결과는 위험도·이유·공식 근거·수정 방향까지 한 화면에서 확인합니다.', 14, '#4d3bd7', 700)}
  `;
  return `<rect width="${W}" height="${H}" fill="#f7f8fb"/>${browserFrame(main)}`;
};

const cover = () => {
  const ui = `
    ${r(830, 118, 650, 560, '#ffffff', 24, '#e7e9f1', 1)}
    ${r(830, 118, 650, 52, '#f7f8fb', 24)}<rect x="830" y="145" width="650" height="25" fill="#f7f8fb"/>
    ${circle(856, 144, 6, '#ff5f57')}${circle(876, 144, 6, '#ffbd2e')}${circle(896, 144, 6, '#28c840')}${r(925, 133, 380, 22, '#ffffff', 11, '#e3e6ee', 1)}${t(944, 138, 'contentlint-ai.garam918.workers.dev', 10, '#8a93a5', 500)}
    ${logo(872, 204, 0.56)}${t(872, 260, '검사 결과', 12, '#5e48e8', 600)}${t(872, 285, '확인할 표현 2개', 26, '#17213d', 800)}
    ${pill(872, 330, '높은 위험', '#fff1f1', '#b23a45', 86)}${pill(970, 330, '일반 광고', '#f6f6ff', '#5946dd', 82)}
    ${card(872, 390, 565, 88, '“업무 시간을 70% 줄여주는”', '객관적이고 타당한 실증 자료가 필요할 수 있습니다.', '#e34f5f')}
    ${card(872, 492, 565, 88, '“국내 최고의”', '비교 기준 없이 배타적 우위를 주장하면 위험할 수 있습니다.', '#e34f5f')}
    ${r(872, 610, 565, 34, '#f6f6ff', 14)}${t(895, 620, '근거 연결됨 · 수정 방향 제안 · 재검사', 11, '#5946dd', 600)}
  `;
  return `
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d1b45"/><stop offset=".62" stop-color="#3f2e9d"/><stop offset="1" stop-color="#6e58ec"/></linearGradient><filter id="coverShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#060717" flood-opacity=".32"/></filter></defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="1460" cy="40" r="300" fill="#9b8cff" opacity=".12"/><circle cx="1200" cy="860" r="240" fill="#0ce1d0" opacity=".08"/>
    ${logo(110, 104, 0.95, true)}
    ${t(112, 242, '게시 전 광고 사전검수', 18, '#bcb5ff', 700)}
    ${t(110, 288, '콘텐츠를 올리기 전,', 46, '#ffffff', 800)}
    ${t(110, 350, '위험 표현부터 잡아보세요.', 46, '#ffffff', 800)}
    ${t(112, 440, '문구·웹페이지·이미지에서 문제 구간을 찾고', 18, '#dedcff', 400)}
    ${t(112, 472, '공식 근거와 수정 방향까지 한 번에 확인합니다.', 18, '#dedcff', 400)}
    ${pill(112, 560, 'HIGH RISK', '#ffeaec', '#aa3444', 110)}${pill(240, 560, '공식 근거 연결', '#e8e4ff', '#5846dc', 122)}${pill(382, 560, '재검사 지원', '#e2fbf5', '#168672', 100)}
    ${t(112, 720, 'ContentLint AI  ·  contentlint-ai.garam918.workers.dev', 13, '#bcb8e9', 600)}
    <g filter="url(#coverShadow)">${ui}</g>
    ${r(744, 695, 92, 34, '#ffffff', 17)}${t(790, 705, '사전검수', 12, '#4d3bd7', 700, 'middle')}
  `;
};

const assets = [
  ['contentlint-ai-cover.png', cover()],
  ['contentlint-ai-screenshot-01-new-scan.png', inputScreen()],
  ['contentlint-ai-screenshot-02-analysis-progress.png', progressScreen()],
  ['contentlint-ai-screenshot-03-result-overview.png', resultScreen()],
  ['contentlint-ai-screenshot-04-issue-inspector.png', inspectorScreen()],
  ['contentlint-ai-screenshot-05-input-types.png', inputTypesScreen()],
];

await fs.mkdir(outDir, { recursive: true });
for (const [name, svg] of assets) {
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`,
    ),
  )
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, name));
}
console.log(`generated ${assets.length} assets in ${outDir}`);
