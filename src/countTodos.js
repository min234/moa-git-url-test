export const NO_OWNER = '(담당 없음)';

/** 전체 할 일 개수. */
export function countTodos(todos) {
  return todos.length;
}

/** owner를 문자열로 바꿔 앞뒤 공백을 지운 값. 없거나 null이거나 공백뿐이면 null. */
function ownerKey(owner) {
  if (owner === undefined || owner === null) return null;
  const s = String(owner).trim();
  return s === '' ? null : s;
}

/**
 * 담당별 개수를 [담당, 개수] 배열로 돌려준다.
 * 순서는 입력에서 처음 나온 순서, 담당 없는 일은 NO_OWNER로 묶어 맨 뒤.
 */
export function countByOwner(todos) {
  const counts = new Map();
  let none = 0;
  for (const todo of todos) {
    const key = ownerKey(todo.owner);
    if (key === null) none += 1;
    else counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()];
  if (none > 0) rows.push([NO_OWNER, none]);
  return rows;
}

/** [담당, 개수] 배열을 "담당: 개수" 줄들로(줄마다 \n). 비어 있으면 빈 문자열. */
export function formatByOwner(rows) {
  return rows.map(([owner, n]) => `${owner}: ${n}\n`).join('');
}
