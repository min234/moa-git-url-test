import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/todo-group.js', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/todos.json', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'todo-group-'));

function runArgs(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

function run(content) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, content);
  return runArgs([file]);
}

test('CLI: examples/todos.json 출력 전체 일치, 종료 코드 0', () => {
  const r = runArgs([EXAMPLE]);
  assert.equal(r.status, 0);
  assert.equal(
    r.stdout,
    '기획팀 (1)\n  - 2026-11-20 주간 회의록 정리\n\n' +
      '개발팀 (1)\n  - 2026-11-21 보고서, "초안"\n\n' +
      '(담당 없음) (1)\n  - 2026-11-24 배포 점검\n',
  );
});

test('CLI: A,B,A → A (2) 먼저, B (1) 다음', () => {
  const r = run(
    JSON.stringify([
      { title: 'a1', owner: 'A' },
      { title: 'b1', owner: 'B' },
      { title: 'a2', owner: 'A' },
    ]),
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'A (2)\n  - (마감 없음) a1\n  - (마감 없음) a2\n\nB (1)\n  - (마감 없음) b1\n');
});

test('CLI: 빈 배열이면 출력 없음, 종료 코드 0', () => {
  const r = run('[]');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

const errors = {
  '인자 없음': () => runArgs([]),
  '없는 파일': () => runArgs([join(dir, 'nope.json')]),
  'JSON 아님': () => run('not json'),
  '배열 아님': () => run('{"title":"x"}'),
  '객체 아닌 항목': () => run('[1]'),
  'title 없음': () => run('[{"owner":"A"}]'),
  'title 빈 문자열': () => run('[{"title":""}]'),
};

for (const [name, fn] of Object.entries(errors)) {
  test(`CLI 오류: ${name} → stderr가 todo-group: 로 시작, 종료 코드 1`, () => {
    const r = fn();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^todo-group: /);
    assert.equal(r.stdout, '');
  });
}
