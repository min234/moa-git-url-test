import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/todo-count.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'todo-count-'));

function file(content) {
  const p = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, content);
  return p;
}

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

const THREE = JSON.stringify([
  { title: 'a', due: '2026-11-20', owner: '기획팀' },
  { title: 'b', due: '2026-11-21', owner: '개발팀' },
  { title: 'c' },
]);

test('CLI: 3개 항목 → "3\\n", 종료 코드 0', () => {
  const r = run(file(THREE));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '3\n');
});

test('CLI: 빈 배열 → "0\\n", 종료 코드 0', () => {
  const r = run(file('[]'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '0\n');
});

test('CLI --by-owner: 담당별 개수, 담당 없음은 맨 뒤', () => {
  const todos = [{ owner: '기획팀' }, { owner: '개발팀' }, { owner: '기획팀' }, {}];
  const r = run('--by-owner', file(JSON.stringify(todos)));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '기획팀: 2\n개발팀: 1\n(담당 없음): 1\n');
});

test('CLI --by-owner: 빈 배열 → 출력 없음, 종료 코드 0', () => {
  const r = run('--by-owner', file('[]'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

const errorCases = [
  ['인자 없음', () => []],
  ['파일 없음', () => [join(dir, 'no-such-file.json')]],
  ['JSON 아님', () => [file('not json')]],
  ['배열 아님', () => [file('{"title":"a"}')]],
  ['객체 아닌 항목', () => [file('[1, 2]')]],
  ['모르는 옵션', () => ['--nope', file('[]')]],
];

for (const [name, args] of errorCases) {
  test(`CLI 오류: ${name} → 종료 코드 1, 표준 오류가 "todo-count: "로 시작`, () => {
    const r = run(...args());
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.startsWith('todo-count: '), r.stderr);
  });
}
