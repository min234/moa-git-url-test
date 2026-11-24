import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { createReplayServer } from '../src/replayApi.js';

const SAMPLE = readFileSync(new URL('../examples/session-sample.jsonl', import.meta.url), 'utf8');
const servers = [];

async function start(opts) {
  const server = createReplayServer(opts);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  return `http://localhost:${server.address().port}`;
}

after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

const post = (base, body, path = '/replay') =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-ndjson' }, body });

function assertCors(r) {
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
}

test('API: 예시 기록 → 200, steps 8개, kind 순서, stats', async () => {
  const base = await start();
  const r = await post(base, SAMPLE);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  assertCors(r);
  const body = await r.json();
  assert.equal(body.steps.length, 8);
  assert.deepEqual(body.steps.map((s) => s.kind), ['thinking', 'read', 'result', 'edit', 'result', 'command', 'result', 'thinking']);
  assert.equal(body.steps[1].durationMs, 350);
  assert.deepEqual(body.stats, { lines: 10, used: 8, ignored: 2, badLines: 0 });
});

test('API 화면용 약속: 각 단계 칸 모양', async () => {
  const base = await start();
  const { steps } = await (await post(base, SAMPLE)).json();
  const labels = { read: '읽기', edit: '수정', command: '명령', result: '결과', thinking: '생각' };
  steps.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.equal(s.label, labels[s.kind]);
    assert.equal(new Date(s.at).toISOString(), s.at);
    assert.ok(s.durationMs === null || (Number.isFinite(s.durationMs) && s.durationMs >= 0));
    assert.ok(typeof s.summary === 'string' && s.summary.length <= 120);
    assert.equal(typeof s.content, 'string');
  });
});

test('API: 쿼리 문자열 무시(/replay?x=1)', async () => {
  const base = await start();
  const r = await post(base, SAMPLE, '/replay?x=1');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).steps.length, 8);
});

test('API: 비밀이 든 기록 → 응답 어디에도 원래 값 없음, [가림] 있음', async () => {
  const secrets = [
    'sk-ant-api03-AbCdEf0123456789xyz',
    'ghp_0123456789abcdefABCDEF0123',
    'eyJhbGciOiJIUzI1NiJ9.payload.sig',
    'hunter2',
    'Pa55word!',
    'MIIEow0123SECRETKEYBODY',
  ];
  const text = [
    JSON.stringify({ type: 'assistant', timestamp: '2026-11-20T09:00:00Z', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: `export KEY=${secrets[0]} GH=${secrets[1]}; curl -H "Authorization: Bearer ${secrets[2]}" -d password=${secrets[3]}` } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-11-20T09:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: `{"password":"${secrets[4]}"}\n-----BEGIN PRIVATE KEY-----\n${secrets[5]}\n-----END PRIVATE KEY-----` }] } }),
  ].join('\n');
  const base = await start();
  const r = await post(base, text);
  assert.equal(r.status, 200);
  const raw = await r.text();
  for (const s of secrets) assert.ok(!raw.includes(s), s);
  assert.ok(raw.includes('[가림]'));
});

test('API: 깨진 JSON 줄 1개 → 200, 나머지 단계 그대로, badLines 1', async () => {
  const lines = SAMPLE.trim().split('\n');
  lines.splice(4, 0, '{not json');
  const base = await start();
  const r = await post(base, lines.join('\n'));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.stats.badLines, 1);
  assert.equal(body.steps.length, 8);
});

test('API: 결과 문자열/배열 모두 글, is_error → isError true', async () => {
  const text = [
    JSON.stringify({ type: 'assistant', timestamp: '2026-11-20T09:00:00Z', message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'x' } }, { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'y' } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-11-20T09:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: '문자열 결과' }, { type: 'tool_result', tool_use_id: 'b', is_error: true, content: [{ type: 'text', text: '배열 결과' }] }] } }),
  ].join('\n');
  const base = await start();
  const { steps } = await (await post(base, text)).json();
  assert.equal(steps[2].content, '문자열 결과');
  assert.equal(steps[2].isError, false);
  assert.equal(steps[3].content, '배열 결과');
  assert.equal(steps[3].isError, true);
});

test('API 오류: 빈 본문·쓸 줄 0 → 400 {error}', async () => {
  const base = await start();
  for (const body of ['', '\n\n', '{"type":"attachment"}\n{"type":"user","timestamp":"2026-11-20T09:00:00Z","message":{"content":"프롬프트만"}}']) {
    const r = await post(base, body);
    assert.equal(r.status, 400);
    assertCors(r);
    const j = await r.json();
    assert.equal(typeof j.error, 'string');
    assert.ok(j.error.length > 0);
  }
});

test('API 오류: 10MB 넘는 본문 → 413 {error}', async () => {
  const base = await start();
  const r = await post(base, 'a'.repeat(10 * 1024 * 1024 + 1));
  assert.equal(r.status, 413);
  assertCors(r);
  assert.equal(typeof (await r.json()).error, 'string');
});

test('API 오류: 길이 머리 없이(청크) 한도를 넘어도 413', async () => {
  const base = await start({ maxBody: 1000 });
  const { port } = new URL(base);
  const res = await new Promise((resolve, reject) => {
    const req = request({ port, method: 'POST', path: '/replay', headers: { 'Transfer-Encoding': 'chunked' } }, (r) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (d) => (data += d));
      r.on('end', () => resolve({ status: r.statusCode, data, cors: r.headers['access-control-allow-origin'] }));
    });
    req.on('error', reject);
    req.write('b'.repeat(600));
    req.end('b'.repeat(600));
  });
  assert.equal(res.status, 413);
  assert.equal(res.cors, '*');
  assert.equal(typeof JSON.parse(res.data).error, 'string');
});

test('API: GET /replay → 405, 없는 경로 → 404, OPTIONS → 204, 모두 CORS', async () => {
  const base = await start();
  const g = await fetch(`${base}/replay`);
  assert.equal(g.status, 405);
  assertCors(g);
  assert.deepEqual(await g.json(), { error: 'method not allowed' });
  const n = await post(base, SAMPLE, '/nope');
  assert.equal(n.status, 404);
  assertCors(n);
  assert.deepEqual(await n.json(), { error: 'not found' });
  for (const path of ['/replay', '/anything']) {
    const o = await fetch(`${base}${path}`, { method: 'OPTIONS' });
    assert.equal(o.status, 204);
    assertCors(o);
    assert.equal(await o.text(), '');
  }
});

test('API: 오류 뒤에도 다음 요청에 응답', async () => {
  const base = await start();
  assert.equal((await post(base, '').then(async (r) => { await r.arrayBuffer(); return r; })).status, 400);
  assert.equal((await post(base, SAMPLE)).status, 200);
});
