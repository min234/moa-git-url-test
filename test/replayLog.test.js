import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSessionLog, maskSecrets, MAX_CONTENT } from '../src/replayLog.js';

const SAMPLE = readFileSync(new URL('../examples/session-sample.jsonl', import.meta.url), 'utf8');
const KINDS = ['thinking', 'read', 'result', 'edit', 'result', 'command', 'result', 'thinking'];
const LABEL = { read: '읽기', edit: '수정', command: '명령', result: '결과', thinking: '생각' };

const line = (o) => JSON.stringify(o);
const asst = (ts, content) => line({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content } });
const usr = (ts, content) => line({ type: 'user', timestamp: ts, message: { role: 'user', content } });

test('예시 기록 → 8단계, kind 순서, 사용자 프롬프트·attachment는 단계 아님', () => {
  const { steps, stats } = parseSessionLog(SAMPLE);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map((s) => s.kind), KINDS);
  assert.deepEqual(stats, { lines: 10, used: 8, ignored: 2, badLines: 0 });
});

test('칸 모양: index·kind·label·at·durationMs·summary·content', () => {
  const { steps } = parseSessionLog(SAMPLE);
  steps.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.ok(Object.keys(LABEL).includes(s.kind));
    assert.equal(s.label, LABEL[s.kind]);
    assert.equal(typeof s.at, 'string');
    assert.equal(new Date(s.at).toISOString(), s.at);
    assert.ok(s.durationMs === null || (typeof s.durationMs === 'number' && s.durationMs >= 0));
    assert.equal(typeof s.summary, 'string');
    assert.ok(s.summary.length <= 120);
    assert.equal(typeof s.content, 'string');
  });
});

test('걸린 시간: 도구는 결과 줄까지, 나머지는 다음 단계까지, 마지막은 null', () => {
  const { steps } = parseSessionLog(SAMPLE);
  assert.equal(steps[1].tool, 'Read');
  assert.equal(steps[1].durationMs, Date.parse('2026-11-20T09:00:02.350Z') - Date.parse('2026-11-20T09:00:02.000Z'));
  assert.equal(steps[1].durationMs, 350);
  assert.equal(steps[3].durationMs, 200);
  assert.equal(steps[5].durationMs, 2500);
  assert.equal(steps[0].durationMs, 1000);
  assert.equal(steps[2].durationMs, 1650);
  assert.equal(steps[7].durationMs, null);
});

test('요약·내용: 읽기 파일, 수정 이전/이후, 명령 설명, 결과 첫 줄, 생각 첫 줄', () => {
  const { steps } = parseSessionLog(SAMPLE);
  assert.equal(steps[0].summary, '먼저 README를 읽어 오타 위치를 찾는다.');
  assert.equal(steps[1].summary, '읽기: README.md');
  assert.equal(steps[2].summary, '# 샘플');
  assert.equal(steps[2].toolUseId, 'toolu_read1');
  assert.equal(steps[3].summary, '수정: README.md');
  assert.match(steps[3].content, /설명서 입니다[\s\S]*설명서입니다/);
  assert.equal(steps[5].summary, '시험 실행');
  assert.equal(steps[5].content, 'npm test');
  assert.equal(steps[7].summary, '오타를 고쳤고 시험도 통과했어요.');
});

test('결과: 문자열·[{type:text}] 배열 모두 글, is_error → isError true, 요약에 (오류)', () => {
  const { steps } = parseSessionLog(SAMPLE);
  assert.equal(steps[4].content, 'The file README.md has been updated.');
  assert.equal(steps[4].isError, false);
  const err = parseSessionLog(
    [
      asst('2026-11-20T09:00:00Z', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls nope' } }]),
      usr('2026-11-20T09:00:01Z', [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: [{ type: 'text', text: '\nls: nope: 없음' }, { type: 'image' }] }]),
    ].join('\n'),
  ).steps;
  assert.equal(err[0].summary, 'ls nope');
  assert.equal(err[1].isError, true);
  assert.equal(err[1].content, '\nls: nope: 없음');
  assert.equal(err[1].summary, '(오류) ls: nope: 없음');
});

test('깨진 줄은 badLines로 세고 나머지는 그대로', () => {
  const lines = SAMPLE.trim().split('\n');
  lines.splice(3, 0, '{"type":"assistant", 깨짐');
  const { steps, stats } = parseSessionLog(lines.join('\n'));
  assert.equal(stats.badLines, 1);
  assert.deepEqual(steps.map((s) => s.kind), KINDS);
});

test('모르는 줄 종류·모르는 블록·시각 없는 줄은 무시', () => {
  const { steps, stats } = parseSessionLog(
    [
      line({ type: 'api-request-blob', timestamp: '2026-11-20T09:00:00Z', body: 'secret' }),
      line({ type: 'system', timestamp: '2026-11-20T09:00:00Z' }),
      asst('2026-11-20T09:00:01Z', [{ type: 'tool_addition' }, { type: 'text', text: '안녕' }]),
      asst('2026-11-20T09:00:02Z', [{ type: 'redacted_thinking', data: 'x' }]),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: '시각 없음' }] } }),
      '42',
    ].join('\n'),
  );
  assert.equal(steps.length, 1);
  assert.equal(steps[0].content, '안녕');
  assert.deepEqual(stats, { lines: 6, used: 1, ignored: 5, badLines: 0 });
});

test('다른 도구 이름은 명령, 읽기 도구 묶음, MultiEdit·Write 내용', () => {
  const { steps } = parseSessionLog(
    [
      asst('2026-11-20T09:00:00Z', [
        { type: 'tool_use', id: 'a', name: 'Grep', input: { pattern: 'TODO' } },
        { type: 'tool_use', id: 'b', name: 'WebFetch', input: { url: 'https://example.com' } },
        { type: 'tool_use', id: 'c', name: 'Write', input: { file_path: 'a.txt', content: '새 글' } },
        { type: 'tool_use', id: 'd', name: 'MultiEdit', input: { file_path: 'b.txt', edits: [{ old_string: 'x', new_string: 'y' }] } },
        { type: 'tool_use', id: 'e', name: 'Task', input: { prompt: '찾아 줘' } },
      ]),
    ].join('\n'),
  );
  assert.deepEqual(steps.map((s) => s.kind), ['read', 'read', 'edit', 'edit', 'command']);
  assert.equal(steps[0].summary, '읽기: TODO');
  assert.equal(steps[1].summary, '읽기: https://example.com');
  assert.equal(steps[2].content, '새 글');
  assert.match(steps[3].content, /x[\s\S]*y/);
  assert.equal(steps[4].summary, 'Task');
  assert.equal(steps[0].durationMs, null);
});

const SECRETS = {
  'sk-ant': 'sk-ant-api03-AbCdEf0123456789xyz',
  'sk-': 'sk-proj1234567890abcdefXYZ',
  ghp: 'ghp_0123456789abcdefABCDEF0123',
  github_pat: 'github_pat_11ABCDEFG0123456789_abcdef',
  slack: 'xoxb-1234-5678-abcdefgh',
  aws: 'AKIAABCDEFGHIJKLMNOP',
  bearer: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
  pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIEow0123\n-----END RSA PRIVATE KEY-----',
};

test('maskSecrets: 패턴별로 원래 값이 사라지고 [가림]', () => {
  for (const [name, value] of Object.entries(SECRETS)) {
    const text = name === 'bearer' ? `Authorization: Bearer ${value}` : `값 ${value} 끝`;
    const out = maskSecrets(text);
    assert.ok(!out.includes(value), name);
    assert.ok(out.includes('[가림]'), name);
  }
  assert.equal(maskSecrets('password=hunter2 다음'), 'password=[가림] 다음');
  assert.equal(maskSecrets('{"password":"hunter2"}'), '{"password":"[가림]"}');
  assert.equal(maskSecrets('token: abc123'), 'token: [가림]');
  assert.equal(maskSecrets('평범한 글'), '평범한 글');
});

test('가림은 요약과 내용 모두에, 내용은 20,000자에서 자르고 요약은 120자 이하', () => {
  const { steps } = parseSessionLog(
    [
      asst('2026-11-20T09:00:00Z', [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: `curl -H "Authorization: Bearer ${SECRETS.bearer}" -d password=hunter2` } }]),
      usr('2026-11-20T09:00:01Z', [{ type: 'tool_result', tool_use_id: 't', content: `${SECRETS['sk-ant']}\n${'가'.repeat(30000)}` }]),
    ].join('\n'),
  );
  const all = JSON.stringify(steps);
  assert.ok(!all.includes(SECRETS.bearer));
  assert.ok(!all.includes('hunter2'));
  assert.ok(!all.includes(SECRETS['sk-ant']));
  assert.ok(steps[0].summary.includes('[가림]'));
  assert.equal(steps[1].summary, '[가림]');
  assert.equal(steps[1].content.length, MAX_CONTENT);
  assert.ok(steps[1].content.endsWith('…(잘림)'));
  const long = parseSessionLog(asst('2026-11-20T09:00:00Z', [{ type: 'text', text: '나'.repeat(500) }])).steps[0];
  assert.equal(long.summary.length, 120);
});

test('빈 글 → 단계 0', () => {
  assert.deepEqual(parseSessionLog(''), { steps: [], stats: { lines: 0, used: 0, ignored: 0, badLines: 0 } });
});
