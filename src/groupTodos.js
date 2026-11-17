export const NO_OWNER = '(담당 없음)';
export const NO_DUE = '(마감 없음)';

/** owner를 문자열로 바꿔 앞뒤 공백을 지운 값. 없거나 null이거나 공백뿐이면 null. */
export function ownerKey(owner) {
  if (owner === undefined || owner === null) return null;
  const s = String(owner).trim();
  return s === '' ? null : s;
}

/** 각 항목의 title이 비어 있지 않은 문자열인지 검사한다. 아니면 이유가 담긴 Error를 던진다. */
export function validateTitles(todos) {
  todos.forEach((todo, i) => {
    if (typeof todo.title !== 'string' || todo.title.trim() === '') {
      throw new Error(`${i}번째 항목의 title이 비어 있거나 문자열이 아닙니다`);
    }
  });
  return todos;
}

/**
 * 담당별로 묶어 [{ owner, items }] 배열로 돌려준다.
 * 묶음 순서는 입력에서 처음 나온 순서, 담당 없는 일은 NO_OWNER 묶음으로 맨 뒤.
 * 묶음 안은 입력 순서. (Object.groupBy는 Node 21+라 Map으로 구현)
 */
export function groupByOwner(todos) {
  const groups = new Map();
  const none = [];
  for (const todo of todos) {
    const key = ownerKey(todo.owner);
    if (key === null) {
      none.push(todo);
    } else {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(todo);
    }
  }
  const result = [...groups].map(([owner, items]) => ({ owner, items }));
  if (none.length > 0) result.push({ owner: NO_OWNER, items: none });
  return result;
}

/** 묶음을 사람이 읽는 글로: 머리줄 `담당 (개수)`, 항목마다 `  - 마감 제목`, 묶음 사이 빈 줄. */
export function formatGroups(groups) {
  return groups
    .map(({ owner, items }) => {
      const lines = items.map((t) => `  - ${t.due ?? NO_DUE} ${t.title}\n`).join('');
      return `${owner} (${items.length})\n${lines}`;
    })
    .join('\n');
}
