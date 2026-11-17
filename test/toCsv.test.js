import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTodos, escapeCsv, toCsv } from '../src/toCsv.js';

test('머리줄이 정확히 title,due,owner', () => {
  assert.equal(toCsv([]).split('\n')[0], 'title,due,owner');
});

test('N개 입력이면 머리줄 포함 N+1줄', () => {
  const todos = [
    { title: 'a', due: '2026-11-20', owner: 'x' },
    { title: 'b', due: '2026-11-21', owner: 'y' },
    { title: 'c', due: '2026-11-22', owner: 'z' },
  ];
  const lines = toCsv(todos).trimEnd().split('\n');
  assert.equal(lines.length, todos.length + 1);
  assert.equal(lines[1], 'a,2026-11-20,x');
});

test('쉼표·큰따옴표가 든 제목을 RFC 4180대로 이스케이프', () => {
  assert.equal(escapeCsv('보고서, "초안"'), '"보고서, ""초안"""');
  const csv = toCsv([{ title: '보고서, "초안"', due: '2026-11-21', owner: '지영' }]);
  assert.equal(csv.split('\n')[1], '"보고서, ""초안""",2026-11-21,지영');
});

test('줄바꿈이 든 값도 큰따옴표로 감싼다', () => {
  assert.equal(escapeCsv('a\nb'), '"a\nb"');
});

test('빈 배열이면 머리줄만', () => {
  assert.equal(toCsv([]), 'title,due,owner\n');
});

test('빠진 칸은 빈 칸', () => {
  assert.equal(toCsv([{ title: 't' }]).split('\n')[1], 't,,');
});

test('잘못된 JSON·배열 아님은 Error', () => {
  assert.throws(() => parseTodos('{oops'), /JSON이 아닙니다/);
  assert.throws(() => parseTodos('{"a":1}'), /배열/);
  assert.throws(() => parseTodos('[1]'), /객체가 아닙니다/);
});
