import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReplayServer } from '../src/replayApi.js';
import { createStaticServer, resolveRequest } from '../web/serve.js';
import {
  escapeHtml, formatDuration, formatClock, summarizeSteps, formatSummary,
  renderTimeline, renderDetail, renderControls, renderPlayer,
  initState, seek, next, prev, setSpeed, togglePlay, dwellMs, tick, loadReplay, MAX_UPLOAD,
} from '../web/replayView.js';

const SAMPLE_PATH = fileURLToPath(new URL('../examples/session-sample.jsonl', import.meta.url));
const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));

const STEPS = [
  { index: 0, kind: 'thinking', label: '생각', at: '2026-11-20T09:00:01.000Z', durationMs: 1000, summary: '먼저 읽는다', content: '<script>alert(1)</script> & "q"' },
  { index: 1, kind: 'read', label: '읽기', at: '2026-11-20T09:00:02.000Z', durationMs: 350, summary: '읽기: README.md', content: 'a', tool: 'Read', toolUseId: 't1' },
  { index: 2, kind: 'result', label: '결과', at: '2026-11-20T09:00:02.350Z', durationMs: null, summary: '<b>실패</b>', content: 'boom', toolUseId: 't1', isError: true },
  { index: 3, kind: 'edit', label: '수정', at: '2026-11-20T09:01:05.000Z', durationMs: 90000, summary: '수정', content: 'x' },
  { index: 4, kind: 'command', label: '명령', at: '2026-11-20T09:01:06.000Z', durationMs: 2000, summary: '명령', content: 'y' },
];
const okState = (extra = {}) => ({ ...initState({ status: 'ok', steps: STEPS, stats: { lines: 9, used: 5, ignored: 3, badLines: 1 } }), ...extra });
const fakeFetch = (status, body) => async () => ({ status, json: async () => body });

const servers = [];
after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});
const listen = (server) => new Promise((resolve) => server.listen(0, () => (servers.push(server), resolve(server.address().port))));

test('escapeHtml·formatDuration·formatClock', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(formatDuration(1200), '1.2초');
  assert.equal(formatDuration(1000), '1초');
  assert.equal(formatDuration(63000), '1분 3초');
  for (const v of [null, undefined, -1, NaN, '1']) assert.equal(formatDuration(v), '—');
  assert.equal(formatClock('2026-11-20T09:00:01.000Z'), '09:00:01');
  assert.equal(formatClock(undefined), '—');
});

test('summarizeSteps·formatSummary: 단계 수·기록 길이·종류별·건너뛴 줄', () => {
  const sum = summarizeSteps(STEPS, { ignored: 3, badLines: 1 });
  assert.equal(sum.count, 5);
  assert.equal(sum.totalMs, 65000);
  assert.deepEqual(sum.counts, { thinking: 1, read: 1, result: 1, edit: 1, command: 1 });
  assert.equal(sum.skipped, 4);
  const line = formatSummary(sum);
  assert.match(line, /단계 5개/);
  assert.match(line, /기록 길이 1분 5초/);
  assert.match(line, /건너뛴 줄 4\(깨진 줄 1\)/);
  assert.equal(summarizeSteps([], undefined).totalMs, null);
});

test('renderTimeline: 항목 수·종류 칩·aria-current 하나·오류 표시', () => {
  const html = renderTimeline(STEPS, 2);
  assert.equal((html.match(/<li>/g) ?? []).length, STEPS.length);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  const currentItem = html.split('<li>')[3];
  assert.match(currentItem, /aria-current="step"/);
  for (const label of ['읽기', '수정', '명령', '결과', '생각']) assert.match(html, new RegExp(`class="chip kind-\\w+">${label}</span>`));
  assert.equal((html.match(/err-mark/g) ?? []).length, 1);
  assert.match(currentItem, /err-mark/);
  assert.doesNotMatch(html, /<b>실패<\/b>/);
  assert.match(html, /&lt;b&gt;실패&lt;\/b&gt;/);
});

test('renderDetail: 이스케이프·오류 표시·도구·안내 한 줄', () => {
  const html = renderDetail(STEPS[0]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;/);
  assert.match(html, /공유·캡처 전에 내용을 확인하세요/);
  assert.match(renderDetail(STEPS[2]), /오류 결과/);
  assert.match(renderDetail(STEPS[1]), /도구 Read/);
  assert.match(renderDetail(undefined), /단계가 없습니다/);
});

test('renderControls: 버튼·배속 눌림·스크러버·위치', () => {
  const html = renderControls(okState({ current: 2, speed: 2, playing: true }));
  assert.match(html, /data-action="toggle"[^>]*aria-pressed="true">멈춤/);
  assert.match(html, /data-speed="2" aria-pressed="true"/);
  assert.match(html, /data-speed="1" aria-pressed="false"/);
  assert.match(html, /min="0" max="4" value="2"/);
  assert.match(html, />3 \/ 5</);
  assert.match(renderControls(okState({ playing: false })), />재생</);
});

test('renderPlayer: idle·loading·error·빈·ok 상태', () => {
  assert.match(renderPlayer(initState()), /파일을 고르거나 끌어다 놓으세요/);
  assert.match(renderPlayer({ status: 'loading' }), /불러오는 중…/);
  const err = renderPlayer({ status: 'error', message: '<b>나쁨</b>' });
  assert.match(err, /role="alert"/);
  assert.match(err, /기록을 불러오지 못했습니다: &lt;b&gt;나쁨&lt;\/b&gt;/);
  assert.match(renderPlayer({ status: 'ok', steps: [] }), /재생할 단계가 없습니다/);
  const ok = renderPlayer(okState());
  assert.match(ok, /class="summary"/);
  assert.match(ok, /id="timeline"/);
  assert.match(ok, /id="detail"/);
  assert.match(ok, /id="scrub"/);
});

test('재생 상태: prev·next·seek 경계', () => {
  const s = okState();
  assert.equal(prev(s).current, 0);
  assert.equal(next(okState({ current: 4 })).current, 4);
  assert.equal(seek(s, 99).current, 4);
  assert.equal(seek(s, -5).current, 0);
  assert.equal(seek(s, 2.9).current, 2);
  assert.equal(seek(s, NaN).current, 0);
  assert.equal(next(s).current, 1);
  assert.equal(s.current, 0, '원래 상태는 바뀌지 않는다');
});

test('재생 상태: 배속·재생/멈춤·마지막에서 다시 시작', () => {
  const s = okState();
  assert.equal(setSpeed(s, 4).speed, 4);
  assert.equal(setSpeed(s, 3), s);
  assert.equal(togglePlay(s).playing, true);
  assert.equal(togglePlay(togglePlay(s)).playing, false);
  const atEnd = togglePlay(okState({ current: 4 }));
  assert.equal(atEnd.playing, true);
  assert.equal(atEnd.current, 0);
  assert.equal(togglePlay({ status: 'idle' }).playing, undefined);
});

test('dwellMs: 걸린 시간(없으면 1초)÷배속, 최대 3초', () => {
  assert.equal(dwellMs({ durationMs: 400 }, 1), 400);
  assert.equal(dwellMs({ durationMs: 400 }, 2), 200);
  assert.equal(dwellMs({ durationMs: null }, 1), 1000);
  assert.equal(dwellMs({}, 4), 250);
  assert.equal(dwellMs({ durationMs: 90000 }, 1), 3000);
  assert.equal(dwellMs({ durationMs: 90000 }, 4), 3000);
  assert.equal(dwellMs({ durationMs: 8000 }, 4), 2000);
  assert.equal(dwellMs(undefined, 2), 500);
});

test('tick: 한 칸 앞으로, 마지막 단계에 닿으면 재생이 멈춘다', () => {
  let s = okState({ playing: true, current: 2 });
  s = tick(s);
  assert.equal(s.current, 3);
  assert.equal(s.playing, true);
  s = tick(s);
  assert.equal(s.current, 4);
  assert.equal(s.playing, false);
  const stopped = okState({ playing: false, current: 1 });
  assert.equal(tick(stopped), stopped);
});

test('loadReplay: 200 → ok', async () => {
  const stats = { lines: 1, used: 1, ignored: 0, badLines: 0 };
  assert.deepEqual(await loadReplay('u', 'x', fakeFetch(200, { steps: STEPS, stats })), { status: 'ok', steps: STEPS, stats });
  assert.deepEqual((await loadReplay('u', 'x', fakeFetch(200, { steps: [] }))).stats, {});
});

test('loadReplay: 보낼 때 POST·본문 그대로', async () => {
  const calls = [];
  await loadReplay('http://x/replay', 'a\nb', async (url, init) => (calls.push([url, init]), { status: 200, json: async () => ({ steps: [] }) }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'http://x/replay');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].body, 'a\nb');
});

test('loadReplay: 400·405·413·500은 서버 error 글, 글이 없으면 상태 번호', async () => {
  for (const status of [400, 405, 413, 500]) {
    assert.deepEqual(await loadReplay('u', 'x', fakeFetch(status, { error: `이유${status}` })), { status: 'error', message: `이유${status}` });
  }
  assert.deepEqual(await loadReplay('u', 'x', fakeFetch(502, { nope: 1 })), { status: 'error', message: '상태 502' });
  assert.deepEqual(await loadReplay('u', 'x', fakeFetch(502, null)), { status: 'error', message: '상태 502' });
});

test('loadReplay: JSON 아님·fetch 예외·모양 틀림은 error(던지지 않음)', async () => {
  const notJson = async () => ({ status: 200, json: async () => { throw new SyntaxError('bad'); } });
  assert.deepEqual(await loadReplay('u', 'x', notJson), { status: 'error', message: '응답이 JSON이 아닙니다(상태 200)' });
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual(await loadReplay('u', 'x', boom), { status: 'error', message: 'Failed to fetch' });
  const boomEmpty = async () => { throw {}; };
  assert.equal((await loadReplay('u', 'x', boomEmpty)).message, '서버에 연결할 수 없습니다');
  assert.equal((await loadReplay('u', 'x', fakeFetch(200, { steps: 'x' }))).status, 'error');
  assert.equal((await loadReplay('u', 'x', fakeFetch(200, null))).status, 'error');
});

test('loadReplay: 10MB 초과는 fetch를 부르지 않고 오류', async () => {
  let calls = 0;
  const counting = async () => (calls++, { status: 200, json: async () => ({ steps: [] }) });
  const r = await loadReplay('u', 'a'.repeat(MAX_UPLOAD + 1), counting);
  assert.equal(r.status, 'error');
  assert.match(r.message, /너무 큽니다/);
  assert.equal(calls, 0);
  // 글자 수는 한도 이하여도 바이트가 넘으면 막는다(한글 3바이트)
  assert.equal((await loadReplay('u', '가'.repeat(Math.ceil(MAX_UPLOAD / 3) + 1), counting)).status, 'error');
  assert.equal(calls, 0);
  assert.equal((await loadReplay('u', 'a'.repeat(MAX_UPLOAD), counting)).status, 'ok');
  assert.equal(calls, 1);
});

test('연결: 샘플 기록을 실제 replay-api에 보내 받은 응답을 그려도 예외가 없다', async () => {
  const port = await listen(createReplayServer());
  const text = readFileSync(SAMPLE_PATH, 'utf8');
  const result = await loadReplay(`http://127.0.0.1:${port}/replay`, text);
  assert.equal(result.status, 'ok');
  assert.ok(result.steps.length > 0);
  let state = initState(result);
  for (let i = 0; i < result.steps.length + 2; i++) {
    const html = renderPlayer(state);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.equal((renderTimeline(result.steps, state.current).match(/<li>/g) ?? []).length, result.steps.length);
    state = next(state);
  }
  assert.match(renderPlayer(initState(result)), new RegExp(`단계 ${result.steps.length}개`));
});

test('연결: 서버 오류(400 빈 본문)도 화면 오류로 그려진다', async () => {
  const port = await listen(createReplayServer());
  const result = await loadReplay(`http://127.0.0.1:${port}/replay`, '');
  assert.equal(result.status, 'error');
  assert.match(renderPlayer(initState(result)), /role="alert"/);
});

test('serve.js: 경로 이탈 차단·MIME·샘플 한 줄', async () => {
  assert.equal(resolveRequest('/../package.json'), null);
  assert.equal(resolveRequest('/..%2fpackage.json'), null);
  assert.equal(resolveRequest('/%00'), null);
  assert.equal(resolveRequest('/%E0%A4%A'), null);
  assert.ok(resolveRequest('/replay.html').startsWith(WEB_DIR));
  assert.ok(resolveRequest('/').endsWith('replay.html'));
  assert.equal(resolveRequest('/sample.jsonl'), SAMPLE_PATH);

  const port = await listen(createStaticServer());
  const base = `http://127.0.0.1:${port}`;
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match((await fetch(`${base}/replayView.js`)).headers.get('content-type'), /text\/javascript/);
  assert.match((await fetch(`${base}/replay.css`)).headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(`${base}/sample.jsonl`)).status, 200);
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/replay.html`, { method: 'POST' })).status, 405);
});

test('web 새 파일에 외부 URL이 없다(기본 API 주소 상수만 예외)', () => {
  for (const name of ['replay.html', 'replay.js', 'replayView.js', 'replay.css']) {
    const urls = readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8').match(/https?:\/\/[^\s'")]+/g) ?? [];
    const extra = urls.filter((u) => u !== 'http://localhost:3002/replay');
    assert.deepEqual(extra, [], name);
  }
});
