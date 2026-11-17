import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/todo-csv.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'todo-csv-'));

function run(content) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, content);
  return spawnSync(process.execPath, [BIN, file], { encoding: 'utf8' });
}

test('CLI: 첫 줄이 정확히 title,due,owner 이고 N+1줄', () => {
  const todos = [
    { title: 'a', due: '2026-11-20', owner: 'x' },
    { title: 'b', due: '2026-11-21', owner: 'y' },
  ];
  const r = run(JSON.stringify(todos));
  assert.equal(r.status, 0);
  const lines = r.stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'title,due,owner');
  assert.equal(lines.length, todos.length + 1);
});

test('CLI: 쉼표·큰따옴표 제목 이스케이프', () => {
  const r = run(JSON.stringify([{ title: '보고서, "초안"', due: '2026-11-21', owner: '지영' }]));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split('\n')[1], '"보고서, ""초안""",2026-11-21,지영');
});

test('CLI: 빈 배열이면 머리줄만, 종료 코드 0', () => {
  const r = run('[]');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'title,due,owner\n');
});

test('CLI: 잘못된 JSON이면 stdout 비고 종료 코드 0 아님', () => {
  const r = run('{not json');
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /JSON이 아닙니다/);
});

test('CLI: 인자 없으면 사용법과 종료 코드 1', () => {
  const r = spawnSync(process.execPath, [BIN], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
});
