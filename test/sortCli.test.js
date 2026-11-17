import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(...args) {
  return spawnSync(process.execPath, ['bin/todo-sort.js', ...args], { cwd: root, encoding: 'utf8' });
}

function tmpFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-sort-'));
  const p = join(dir, 'todos.json');
  writeFileSync(p, content);
  return p;
}

test('CLI: examples/todos-sort.json 정렬 출력, 종료 코드 0', () => {
  const r = run('examples/todos-sort.json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    ['2026-11-18 견적서 보내기', '2026-11-20 회의록 정리', '2026-11-25 월간 보고', '(마감 없음) 언젠가 할 일', ''].join('\n'),
  );
  assert.equal(r.stderr, '');
});

test('CLI: 빈 배열은 출력 없이 종료 코드 0', () => {
  const r = run(tmpFile('[]'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('CLI: 인자 없음은 사용법과 종료 코드 1', () => {
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /사용법/);
  assert.equal(r.stdout, '');
});

test('CLI: 없는 파일은 종료 코드 1과 오류 메시지', () => {
  const r = run('no-such-file.json');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^todo-sort: 파일을 읽을 수 없습니다/);
});

const badCases = [
  ['JSON 아님', 'oops', /JSON/],
  ['배열 아님', '{}', /배열/],
  ['title 없음', '[{"due":"2026-11-20"}]', /title/],
  ['날짜 2026/11/20', '[{"title":"a","due":"2026/11/20"}]', /형식/],
  ['날짜 2026-13-01', '[{"title":"a","due":"2026-13-01"}]', /없는 날짜/],
];
for (const [name, content, re] of badCases) {
  test(`CLI: ${name}은 종료 코드 1과 표준 오류 메시지`, () => {
    const r = run(tmpFile(content));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^todo-sort: /);
    assert.match(r.stderr, re);
    assert.equal(r.stdout, '');
  });
}
