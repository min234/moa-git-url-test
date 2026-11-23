import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createTodoServer } from '../src/todoApi.js';
import { escapeHtml, formatItem, renderTodos, loadTodos } from '../web/todoView.js';

const EXAMPLE = fileURLToPath(new URL('../examples/todos.json', import.meta.url));
const SAMPLE = [
  { title: '주간 회의록 정리', due: '2026-11-20', owner: '기획팀' },
  { title: '보고서, "초안"', due: '2026-11-21', owner: '개발팀' },
  { title: '배포 점검', due: '2026-11-24' },
];

const liTexts = (html) => [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
const fakeFetch = (status, body) => async () => ({ status, json: async () => body });

const servers = [];
after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

test('화면: 목 응답 3건 → li 3개, 순서·문구 일치', () => {
  const html = renderTodos({ status: 'ok', todos: SAMPLE });
  assert.deepEqual(liTexts(html), [
    '2026-11-20 주간 회의록 정리 (기획팀)',
    '2026-11-21 보고서, &quot;초안&quot; (개발팀)',
    '2026-11-24 배포 점검',
  ]);
});

test('화면: due 없음/null → (마감 없음), owner 없음 → 담당 표시 없음', () => {
  assert.equal(formatItem({ title: '언젠가' }), '(마감 없음) 언젠가');
  assert.equal(formatItem({ title: '널', due: null, owner: '팀' }), '(마감 없음) 널 (팀)');
  assert.equal(formatItem({ title: 'x', due: '2026-12-01' }), '2026-12-01 x');
});

test('화면: 빈 배열 → li 0개 + 할 일이 없습니다', () => {
  const html = renderTodos({ status: 'ok', todos: [] });
  assert.equal(liTexts(html).length, 0);
  assert.match(html, /할 일이 없습니다/);
});

test('화면: 500 {error:"x"} → 목록을 불러오지 못했습니다: x, li 0개', async () => {
  const state = await loadTodos('http://test/todos', fakeFetch(500, { error: 'x' }));
  assert.deepEqual(state, { status: 'error', message: 'x' });
  const html = renderTodos(state);
  assert.match(html, /목록을 불러오지 못했습니다: x/);
  assert.equal(liTexts(html).length, 0);
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

test('화면: 제목의 <script>는 &lt;script&gt;로 이스케이프', () => {
  const html = renderTodos({ status: 'ok', todos: [{ title: '<script>alert(1)</script>' }] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.equal(escapeHtml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('화면: 불러오는 중 문구', () => {
  assert.match(renderTodos({ status: 'loading' }), /불러오는 중…/);
});

test('화면 통합: createTodoServer listen(0) → loadTodos → li 3개', async () => {
  const server = createTodoServer({ file: EXAMPLE });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const state = await loadTodos(`http://localhost:${server.address().port}/todos`);
  assert.equal(state.status, 'ok');
  const items = liTexts(renderTodos(state));
  assert.equal(items.length, 3);
  assert.equal(items[0], '2026-11-20 주간 회의록 정리 (기획팀)');
});
