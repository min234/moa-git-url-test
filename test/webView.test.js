import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTodoServer } from '../src/todoApi.js';
import {
  escapeHtml,
  formatItem,
  renderTodos,
  renderFilters,
  filterByRoute,
  parseRoute,
  loadTodos,
} from '../web/todoView.js';

const EXAMPLE = fileURLToPath(new URL('../examples/todos.json', import.meta.url));
const INDEX_HTML = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const SAMPLE = [
  { title: '주간 회의록 정리', due: '2026-11-20', owner: '기획팀' },
  { title: '보고서, "초안"', due: '2026-11-21', owner: '개발팀' },
  { title: '배포 점검', due: '2026-11-24' },
];

/** 표 본문 행(tbody tr)을 '마감 제목 (담당)' 글로 뽑는다(이스케이프된 그대로). */
const rowTexts = (html) => {
  const body = /<tbody>(.*?)<\/tbody>/s.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => {
    const [due, title, owner] = [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => c[1]);
    return `${due} ${title}${owner ? ` (${owner})` : ''}`;
  });
};
const footer = (html) => /<p class="footer">(.*?)<\/p>/.exec(html)?.[1] ?? null;
const fakeFetch = (status, body) => async () => ({ status, json: async () => body });

const servers = [];
after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

test('화면: 목 응답 3건 → 표 행 3개, 순서·문구 일치, 바닥줄 총 3건', () => {
  const html = renderTodos({ status: 'ok', todos: SAMPLE });
  assert.deepEqual(rowTexts(html), [
    '2026-11-20 주간 회의록 정리 (기획팀)',
    '2026-11-21 보고서, &quot;초안&quot; (개발팀)',
    '2026-11-24 배포 점검',
  ]);
  assert.equal(footer(html), '총 3건');
});

test('화면: 표는 마감·제목·담당 머리줄, 제목줄 옆 총 N건 배지', () => {
  const html = renderTodos({ status: 'ok', todos: SAMPLE });
  const heads = [...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['마감', '제목', '담당']);
  assert.match(html, /<h1>할 일 목록<\/h1> <span class="badge">총 3건<\/span>/);
});

test('화면: due 없음/null → (마감 없음), owner 없음 → 담당 표시 없음', () => {
  assert.equal(formatItem({ title: '언젠가' }), '(마감 없음) 언젠가');
  assert.equal(formatItem({ title: '널', due: null, owner: '팀' }), '(마감 없음) 널 (팀)');
  assert.equal(formatItem({ title: 'x', due: '2026-12-01' }), '2026-12-01 x');
  const html = renderTodos({ status: 'ok', todos: [{ title: '언젠가' }] });
  assert.deepEqual(rowTexts(html), ['(마감 없음) 언젠가']);
});

test('필터: #/owner/기획팀 → 기획팀 행만, 바닥줄 총 1건', () => {
  const hash = `#/owner/${encodeURIComponent('기획팀')}`;
  assert.deepEqual(filterByRoute(SAMPLE, hash), [SAMPLE[0]]);
  const html = renderTodos({ status: 'ok', todos: SAMPLE }, hash);
  assert.deepEqual(rowTexts(html), ['2026-11-20 주간 회의록 정리 (기획팀)']);
  assert.equal(footer(html), '총 1건');
  // 인코딩 안 된 해시도 같은 결과
  assert.deepEqual(filterByRoute(SAMPLE, '#/owner/기획팀'), [SAMPLE[0]]);
});

test('필터: #/·빈 해시·모르는 해시 → 전체', () => {
  for (const hash of ['#/', '', undefined, '#/elsewhere']) {
    assert.equal(filterByRoute(SAMPLE, hash).length, 3, String(hash));
  }
  assert.deepEqual(parseRoute('#/'), { owner: null });
  assert.equal(rowTexts(renderTodos({ status: 'ok', todos: SAMPLE }, '#/')).length, 3);
});

test('필터: 알 수 없는 담당 → 0건 + 빈 안내, 바닥줄 숨김', () => {
  const html = renderTodos({ status: 'ok', todos: SAMPLE }, '#/owner/%EC%97%86%EC%9D%8C');
  assert.equal(rowTexts(html).length, 0);
  assert.match(html, /<p class="state empty">'없음' 담당의 할 일이 없습니다<\/p>/);
  assert.equal(footer(html), null);
});

test('필터 알약: 전체 + 담당별 건수, 지금 보는 것만 aria-current, 담당은 인코딩', () => {
  const html = renderFilters(SAMPLE, '#/owner/%EA%B8%B0%ED%9A%8D%ED%8C%80');
  const pills = [...html.matchAll(/<a class="pill" href="([^"]*)"([^>]*)>(.*?) <span class="count">(\d+)<\/span><\/a>/g)].map(
    (m) => ({ href: m[1], on: m[2].includes('aria-current'), label: m[3], count: Number(m[4]) }),
  );
  assert.deepEqual(pills, [
    { href: '#/', on: false, label: '전체', count: 3 },
    { href: '#/owner/%EA%B8%B0%ED%9A%8D%ED%8C%80', on: true, label: '기획팀', count: 1 },
    { href: '#/owner/%EA%B0%9C%EB%B0%9C%ED%8C%80', on: false, label: '개발팀', count: 1 },
  ]);
  assert.match(renderFilters(SAMPLE, '#/'), /href="#\/" aria-current="page"/);
});

test('화면: 빈 배열 → 할 일이 없습니다 칸, 행 0개, 바닥줄 숨김', () => {
  const html = renderTodos({ status: 'ok', todos: [] });
  assert.equal(rowTexts(html).length, 0);
  assert.match(html, /<p class="state empty">할 일이 없습니다<\/p>/);
  assert.equal(footer(html), null);
});

test('화면: 500 {error:"x"} → 목록을 불러오지 못했습니다: x (role=alert), 행 0개', async () => {
  const state = await loadTodos('http://test/todos', fakeFetch(500, { error: 'x' }));
  assert.deepEqual(state, { status: 'error', message: 'x' });
  const html = renderTodos(state);
  assert.match(html, /<p class="state error" role="alert">목록을 불러오지 못했습니다: x<\/p>/);
  assert.equal(rowTexts(html).length, 0);
  assert.equal(footer(html), null);
});

test('화면: fetch 예외 → 오류 문구, 예외가 밖으로 새지 않음', async () => {
  const state = await loadTodos('http://test/todos', async () => {
    throw new Error('연결 거부');
  });
  assert.equal(state.status, 'error');
  assert.match(renderTodos(state), /목록을 불러오지 못했습니다: 연결 거부/);
});

test('화면: JSON 아닌 응답도 오류 상태', async () => {
  const state = await loadTodos('http://test/todos', async () => ({
    status: 200,
    json: async () => {
      throw new SyntaxError('bad');
    },
  }));
  assert.equal(state.status, 'error');
});

test('화면: 제목·담당·오류의 <script>는 &lt;script&gt;로 이스케이프', () => {
  const evil = '<script>alert(1)</script>';
  const html = renderTodos({ status: 'ok', todos: [{ title: evil, owner: evil }] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!renderTodos({ status: 'ok', todos: [{ title: 'a', owner: evil }] }, `#/owner/${encodeURIComponent(evil)}`).includes('<script>'));
  assert.ok(!renderTodos({ status: 'error', message: evil }).includes('<script>'));
  assert.ok(!renderTodos({ status: 'ok', todos: SAMPLE }, `#/owner/${encodeURIComponent(evil)}`).includes('<script>'));
  assert.equal(escapeHtml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('화면: 불러오는 중 문구(회색 칸), 바닥줄 없음', () => {
  const html = renderTodos({ status: 'loading' });
  assert.match(html, /<p class="state loading" role="status">불러오는 중…<\/p>/);
  assert.equal(footer(html), null);
});

test('모양: index.html에 --accent #047857, 다크·움직임 줄이기·좁은 화면 규칙', () => {
  assert.match(INDEX_HTML, /--accent:\s*#047857/);
  assert.ok(INDEX_HTML.includes('prefers-color-scheme: dark'));
  assert.ok(INDEX_HTML.includes('prefers-reduced-motion'));
  assert.ok(INDEX_HTML.includes('max-width: 480px'));
  assert.match(INDEX_HTML, /outline: 2px solid var\(--focus-ring\)/);
  assert.match(INDEX_HTML, /--focus-ring: rgba\(16, 185, 129, \.45\)/);
  assert.match(INDEX_HTML, /260ms/);
  // 강조 초록은 하나: 라이트 변수 묶음 밖에 #047857이 직접 적히지 않는다
  assert.equal(INDEX_HTML.match(/#047857/g).length, 1);
});

test('화면 통합: createTodoServer listen(0) → loadTodos → 행 3개', async () => {
  const server = createTodoServer({ file: EXAMPLE });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const state = await loadTodos(`http://localhost:${server.address().port}/todos`);
  assert.equal(state.status, 'ok');
  const html = renderTodos(state);
  const rows = rowTexts(html);
  assert.equal(rows.length, 3);
  assert.equal(rows[0], '2026-11-20 주간 회의록 정리 (기획팀)');
  assert.equal(footer(html), '총 3건');
});
