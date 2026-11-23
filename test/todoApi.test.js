import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTodoServer } from '../src/todoApi.js';

const EXAMPLE = fileURLToPath(new URL('../examples/todos.json', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'todo-api-'));
const servers = [];

function tempFile(content) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, content);
  return file;
}

async function start(file) {
  const server = createTodoServer({ file });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  return `http://localhost:${server.address().port}`;
}

after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

test('API: examples/todos.json → GET /todos 200, JSON, 3개 항목 deepEqual', async () => {
  const base = await start(EXAMPLE);
  const r = await fetch(`${base}/todos`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  const body = await r.json();
  assert.equal(body.length, 3);
  assert.deepEqual(body, JSON.parse(readFileSync(EXAMPLE, 'utf8')));
});

test('API: 쿼리 문자열은 무시한다(/todos?x=1)', async () => {
  const base = await start(EXAMPLE);
  const r = await fetch(`${base}/todos?x=1`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).length, 3);
});

test('API: HEAD /todos → 200, 본문 없음', async () => {
  const base = await start(EXAMPLE);
  const r = await fetch(`${base}/todos`, { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(await r.text(), '');
});

test('API: 빈 배열 파일 → 200, 본문 []', async () => {
  const base = await start(tempFile('[]'));
  const r = await fetch(`${base}/todos`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
});

test('API: 응답에 CORS 머리가 있다', async () => {
  const base = await start(EXAMPLE);
  for (const path of ['/todos', '/nope']) {
    const r = await fetch(`${base}${path}`);
    await r.arrayBuffer();
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.equal(r.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  }
});

test('API: OPTIONS /todos·아무 경로 → 204, CORS 머리', async () => {
  const base = await start(EXAMPLE);
  for (const path of ['/todos', '/anything']) {
    const r = await fetch(`${base}${path}`, { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.equal(r.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
    assert.equal(await r.text(), '');
  }
});

test('API: 없는 경로 GET /nope → 404 {error}', async () => {
  const base = await start(EXAMPLE);
  const r = await fetch(`${base}/nope`);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await r.json(), { error: 'not found' });
});

test('API: POST /todos → 405 {error}', async () => {
  const base = await start(EXAMPLE);
  const r = await fetch(`${base}/todos`, { method: 'POST', body: '[]' });
  assert.equal(r.status, 405);
  assert.deepEqual(await r.json(), { error: 'method not allowed' });
});

const badFiles = {
  'JSON 아님': 'not json',
  '배열 아님': '{"title":"x"}',
  'title 빈 문자열': '[{"title":""}]',
  'due 2026-02-30': '[{"title":"x","due":"2026-02-30"}]',
};

for (const [name, content] of Object.entries(badFiles)) {
  test(`API 오류: ${name} → 500 {error}, 다음 요청에도 응답`, async () => {
    const base = await start(tempFile(content));
    const r = await fetch(`${base}/todos`);
    assert.equal(r.status, 500);
    assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await r.json();
    assert.equal(typeof body.error, 'string');
    assert.ok(body.error.length > 0);
    const again = await fetch(`${base}/todos`);
    assert.equal(again.status, 500);
    await again.arrayBuffer();
    const other = await fetch(`${base}/nope`);
    assert.equal(other.status, 404);
    await other.arrayBuffer();
  });
}

test('API 오류: 없는 파일 → 500 {error}', async () => {
  const base = await start(join(dir, 'missing.json'));
  const r = await fetch(`${base}/todos`);
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /파일을 읽을 수 없습니다/);
});

test('API: 파일을 고치면 다음 응답에 반영된다(요청마다 읽기)', async () => {
  const file = tempFile('[{"title":"처음"}]');
  const base = await start(file);
  assert.deepEqual(await (await fetch(`${base}/todos`)).json(), [{ title: '처음' }]);
  writeFileSync(file, 'broken');
  assert.equal((await fetch(`${base}/todos`).then(async (r) => { await r.arrayBuffer(); return r; })).status, 500);
  writeFileSync(file, '[{"title":"바뀜","due":"2026-12-01"}]');
  assert.deepEqual(await (await fetch(`${base}/todos`)).json(), [{ title: '바뀜', due: '2026-12-01' }]);
});
