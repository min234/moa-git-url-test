const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** JSON 텍스트를 파싱하고 검증한다. 잘못되면 이유가 담긴 Error를 던진다. */
export function parseTodos(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON이 아닙니다: ${e.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('입력은 배열이어야 합니다');
  }
  data.forEach((item, i) => {
    const where = `${i}번째 항목`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${where}이 객체가 아닙니다`);
    }
    if (typeof item.title !== 'string' || item.title.trim() === '') {
      throw new Error(`${where}의 title은 비어 있지 않은 문자열이어야 합니다`);
    }
    const { due } = item;
    if (due === undefined || due === null) return;
    if (typeof due !== 'string' || !DATE_RE.test(due)) {
      throw new Error(`${where}의 due 형식이 틀렸습니다(YYYY-MM-DD): ${JSON.stringify(due)}`);
    }
    if (!isRealDate(due)) {
      throw new Error(`${where}의 due가 없는 날짜입니다: ${due}`);
    }
  });
  return data;
}

/** 마감 오름차순(같은 마감은 입력 순서), 마감 없는 일은 입력 순서대로 맨 뒤. 새 배열을 돌려준다. */
export function sortTodos(todos) {
  const hasDue = (t) => t.due !== undefined && t.due !== null;
  const withDue = todos.filter(hasDue);
  const noDue = todos.filter((t) => !hasDue(t));
  // Array.prototype.sort는 안정 정렬(ES2019+)이라 같은 마감은 입력 순서를 유지한다.
  withDue.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return [...withDue, ...noDue];
}

/** "YYYY-MM-DD 제목" 또는 "(마감 없음) 제목" */
export function formatTodo(todo) {
  const hasDue = todo.due !== undefined && todo.due !== null;
  return `${hasDue ? todo.due : '(마감 없음)'} ${todo.title}`;
}
