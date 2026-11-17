import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countTodos, countByOwner, formatByOwner, NO_OWNER } from '../src/countTodos.js';

test('countTodos: 항목 수', () => {
  assert.equal(countTodos([{}, {}, {}]), 3);
  assert.equal(countTodos([]), 0);
});

test('countByOwner: 처음 나온 순서, 담당 없음은 맨 뒤', () => {
  const rows = countByOwner([
    { owner: '기획팀' },
    {},
    { owner: '개발팀' },
    { owner: '기획팀' },
  ]);
  assert.deepEqual(rows, [['기획팀', 2], ['개발팀', 1], [NO_OWNER, 1]]);
});

test('countByOwner: null·공백뿐인 owner는 담당 없음, 앞뒤 공백은 지워 묶음', () => {
  const rows = countByOwner([
    { owner: null },
    { owner: '   ' },
    { owner: ' 기획팀 ' },
    { owner: '기획팀' },
    { owner: 7 },
  ]);
  assert.deepEqual(rows, [['기획팀', 2], ['7', 1], [NO_OWNER, 2]]);
});

test('countByOwner: 빈 배열이면 빈 결과', () => {
  assert.deepEqual(countByOwner([]), []);
  assert.equal(formatByOwner([]), '');
});

test('formatByOwner: "담당: 개수" 줄', () => {
  assert.equal(formatByOwner([['기획팀', 2], [NO_OWNER, 1]]), '기획팀: 2\n(담당 없음): 1\n');
});
