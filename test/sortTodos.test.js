import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTodos, sortTodos, formatTodo } from '../src/sortTodos.js';

test('마감 오름차순으로 정렬한다(11-20, 11-18, 11-25 → 11-18, 11-20, 11-25)', () => {
  const input = [
    { title: 'A', due: '2026-11-20' },
    { title: 'B', due: '2026-11-18' },
    { title: 'C', due: '2026-11-25' },
  ];
  assert.deepEqual(sortTodos(input).map((t) => t.due), ['2026-11-18', '2026-11-20', '2026-11-25']);
});

test('마감 없는 일(없음·null)은 맨 뒤에 입력 순서대로', () => {
  const input = [
    { title: '없음1' },
    { title: 'A', due: '2026-11-20' },
    { title: '없음2', due: null },
    { title: 'B', due: '2026-11-18' },
  ];
  assert.deepEqual(sortTodos(input).map(formatTodo), [
    '2026-11-18 B',
    '2026-11-20 A',
    '(마감 없음) 없음1',
    '(마감 없음) 없음2',
  ]);
});

test('같은 마감인 두 일은 입력 순서를 유지한다', () => {
  const input = [
    { title: '먼저', due: '2026-11-20' },
    { title: '이른', due: '2026-11-01' },
    { title: '나중', due: '2026-11-20' },
  ];
  assert.deepEqual(sortTodos(input).map((t) => t.title), ['이른', '먼저', '나중']);
});

test('원본 배열을 바꾸지 않는다', () => {
  const input = [{ title: 'A', due: '2026-11-20' }, { title: 'B', due: '2026-11-18' }];
  const copy = structuredClone(input);
  sortTodos(input);
  assert.deepEqual(input, copy);
});

test('빈 배열은 빈 배열', () => {
  assert.deepEqual(sortTodos(parseTodos('[]')), []);
});

test('formatTodo 모양', () => {
  assert.equal(formatTodo({ title: 'X', due: '2026-01-02' }), '2026-01-02 X');
  assert.equal(formatTodo({ title: 'X' }), '(마감 없음) X');
});

test('윤년 2월 29일은 받는다', () => {
  assert.equal(parseTodos('[{"title":"a","due":"2028-02-29"}]').length, 1);
});

const bad = [
  ['배열 아님', '{"title":"a"}', /배열/],
  ['title 없음', '[{"due":"2026-11-20"}]', /title/],
  ['title 빈 문자열', '[{"title":"  "}]', /title/],
  ['항목이 객체 아님', '["a"]', /객체/],
  ['날짜 2026/11/20', '[{"title":"a","due":"2026/11/20"}]', /형식/],
  ['날짜 2026-13-01', '[{"title":"a","due":"2026-13-01"}]', /없는 날짜/],
  ['날짜 2026-02-30', '[{"title":"a","due":"2026-02-30"}]', /없는 날짜/],
  ['JSON 아님', 'not json', /JSON/],
];
for (const [name, text, re] of bad) {
  test(`오류: ${name}`, () => {
    assert.throws(() => parseTodos(text), re);
  });
}
