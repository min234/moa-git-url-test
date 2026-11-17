import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_OWNER,
  NO_DUE,
  ownerKey,
  validateTitles,
  groupByOwner,
  formatGroups,
} from '../src/groupTodos.js';

test('ownerKey: 공백 정리, 없음·null·공백뿐이면 null', () => {
  assert.equal(ownerKey(' A '), 'A');
  assert.equal(ownerKey(undefined), null);
  assert.equal(ownerKey(null), null);
  assert.equal(ownerKey('   '), null);
});

test('groupByOwner: A,B,A → A(2) 먼저, 묶음 안은 입력 순서', () => {
  const g = groupByOwner([
    { title: 'a1', owner: 'A' },
    { title: 'b1', owner: 'B' },
    { title: 'a2', owner: 'A' },
  ]);
  assert.deepEqual(
    g.map((x) => [x.owner, x.items.map((t) => t.title)]),
    [
      ['A', ['a1', 'a2']],
      ['B', ['b1']],
    ],
  );
});

test("groupByOwner: ' A '와 'A'는 같은 묶음", () => {
  const g = groupByOwner([{ title: 'x', owner: ' A ' }, { title: 'y', owner: 'A' }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].owner, 'A');
  assert.equal(g[0].items.length, 2);
});

test('groupByOwner: 담당 없음·null·공백은 맨 뒤 (담당 없음) 묶음', () => {
  const g = groupByOwner([
    { title: 'n1' },
    { title: 'n2', owner: null },
    { title: 'a', owner: 'A' },
    { title: 'n3', owner: '  ' },
  ]);
  assert.deepEqual(g.map((x) => x.owner), ['A', NO_OWNER]);
  assert.deepEqual(g[1].items.map((t) => t.title), ['n1', 'n2', 'n3']);
});

test('formatGroups: 마감 없음·null 표시, 묶음 사이 빈 줄', () => {
  const out = formatGroups(
    groupByOwner([
      { title: 'a', owner: 'A', due: '2026-11-20' },
      { title: 'b', owner: 'B' },
      { title: 'c', owner: 'B', due: null },
    ]),
  );
  assert.equal(out, `A (1)\n  - 2026-11-20 a\n\nB (2)\n  - ${NO_DUE} b\n  - ${NO_DUE} c\n`);
});

test('formatGroups: 빈 배열이면 빈 문자열', () => {
  assert.equal(formatGroups(groupByOwner([])), '');
});

test('validateTitles: title 없음·빈 문자열·문자열 아님은 오류', () => {
  assert.throws(() => validateTitles([{ owner: 'A' }]), /0번째 항목의 title/);
  assert.throws(() => validateTitles([{ title: 'ok' }, { title: '' }]), /1번째 항목의 title/);
  assert.throws(() => validateTitles([{ title: 3 }]), /title/);
  assert.doesNotThrow(() => validateTitles([{ title: 'ok' }]));
});
