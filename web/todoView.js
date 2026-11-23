/** 할 일 목록 화면의 순수 함수 모음(DOM을 쓰지 않아 브라우저와 Node 시험에서 같이 쓴다). */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 특수 문자를 글자로 바꾼다. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** 할 일 한 건을 '마감 제목 (담당)' 한 줄로 만든다(이스케이프 전 글). */
export function formatItem(todo) {
  const hasDue = todo.due !== undefined && todo.due !== null;
  const owner = typeof todo.owner === 'string' && todo.owner.trim() !== '' ? ` (${todo.owner})` : '';
  return `${hasDue ? todo.due : '(마감 없음)'} ${todo.title}${owner}`;
}

/** 화면 상태를 HTML 문자열로 그린다. */
export function renderTodos(state) {
  if (state.status === 'loading') return '<p class="loading">불러오는 중…</p>';
  if (state.status === 'error') {
    return `<p class="error" role="alert">목록을 불러오지 못했습니다: ${escapeHtml(state.message)}</p>`;
  }
  const todos = state.todos ?? [];
  if (todos.length === 0) return '<p class="empty">할 일이 없습니다</p>';
  const items = todos.map((t) => `<li>${escapeHtml(formatItem(t))}</li>`).join('');
  return `<ul class="todos">${items}</ul>`;
}

/** GET url로 할 일 목록을 받아 화면 상태로 돌려준다. 예외를 밖으로 던지지 않는다. */
export async function loadTodos(url, fetchFn = globalThis.fetch) {
  let res;
  try {
    res = await fetchFn(url);
  } catch (e) {
    return { status: 'error', message: e?.message || '서버에 연결할 수 없습니다' };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', message: `응답이 JSON이 아닙니다(상태 ${res.status})` };
  }
  if (res.status !== 200) {
    const message = body && typeof body.error === 'string' ? body.error : `상태 ${res.status}`;
    return { status: 'error', message };
  }
  if (!Array.isArray(body)) return { status: 'error', message: '응답이 배열이 아닙니다' };
  return { status: 'ok', todos: body };
}
