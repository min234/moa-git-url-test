/** 할 일 목록 화면의 순수 함수 모음(DOM을 쓰지 않아 브라우저와 Node 시험에서 같이 쓴다). */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 특수 문자를 글자로 바꾼다. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** 담당 이름(앞뒤 공백 제거). 없거나 빈 글이면 ''. */
function ownerOf(todo) {
  return typeof todo.owner === 'string' ? todo.owner.trim() : '';
}

/** 마감 칸 글. 없거나 null이면 '(마감 없음)'. */
function dueOf(todo) {
  return todo.due !== undefined && todo.due !== null ? String(todo.due) : '(마감 없음)';
}

/** 할 일 한 건을 '마감 제목 (담당)' 한 줄로 만든다(이스케이프 전 글). */
export function formatItem(todo) {
  const owner = ownerOf(todo);
  return `${dueOf(todo)} ${todo.title}${owner ? ` (${owner})` : ''}`;
}

/** 해시를 보기 조건으로 읽는다. '#/owner/<담당>'만 담당 조건, 나머지는 전체. */
export function parseRoute(hash) {
  const m = /^#\/owner\/(.+)$/.exec(hash ?? '');
  if (!m) return { owner: null };
  try {
    return { owner: decodeURIComponent(m[1]) };
  } catch {
    return { owner: m[1] };
  }
}

/** 담당 해시 주소. */
export function ownerHref(owner) {
  return `#/owner/${encodeURIComponent(owner)}`;
}

/** 해시 조건에 맞는 할 일만 돌려준다('#/' 또는 빈 해시 = 전체). */
export function filterByRoute(todos, hash) {
  const { owner } = parseRoute(hash);
  if (owner === null) return todos;
  return todos.filter((t) => ownerOf(t) === owner);
}

/** 담당별 건수(처음 나온 순서). 담당 없는 일은 세지 않는다. */
export function countByOwner(todos) {
  const counts = new Map();
  for (const t of todos) {
    const o = ownerOf(t);
    if (o) counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  return [...counts].map(([owner, count]) => ({ owner, count }));
}

/** 필터 알약 줄: 전체 + 담당별(건수 배지). 지금 보는 것은 aria-current. */
export function renderFilters(todos, hash) {
  const { owner: active } = parseRoute(hash);
  const pill = (href, label, count, on) =>
    `<a class="pill" href="${escapeHtml(href)}"${on ? ' aria-current="page"' : ''}>` +
    `${escapeHtml(label)} <span class="count">${count}</span></a>`;
  const pills = [pill('#/', '전체', todos.length, active === null)];
  for (const { owner, count } of countByOwner(todos)) {
    pills.push(pill(ownerHref(owner), owner, count, owner === active));
  }
  return `<nav class="filters" aria-label="담당 필터">${pills.join('')}</nav>`;
}

function titleBar(total) {
  const badge = total === undefined ? '' : ` <span class="badge">총 ${total}건</span>`;
  return `<header class="titlebar"><h1>할 일 목록</h1>${badge}</header>`;
}

function renderTable(todos) {
  const rows = todos
    .map(
      (t) =>
        `<tr><td class="due">${escapeHtml(dueOf(t))}</td>` +
        `<td class="title">${escapeHtml(t.title)}</td>` +
        `<td class="owner">${escapeHtml(ownerOf(t))}</td></tr>`,
    )
    .join('');
  return (
    '<div class="table-wrap"><table class="todos">' +
    '<thead><tr><th scope="col">마감</th><th scope="col">제목</th><th scope="col">담당</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>`
  );
}

/**
 * 화면 상태를 HTML 문자열로 그린다.
 * 제목줄(h1 + 총 N건) → 필터 알약 → 표(마감·제목·담당) → 바닥줄 '총 N건'.
 * 불러오는 중/빈/오류는 색 칸 한 줄.
 */
export function renderTodos(state, hash = '#/') {
  if (state.status === 'loading') {
    return `${titleBar()}<p class="state loading" role="status">불러오는 중…</p>`;
  }
  if (state.status === 'error') {
    return (
      titleBar() +
      `<p class="state error" role="alert">목록을 불러오지 못했습니다: ${escapeHtml(state.message)}</p>`
    );
  }
  const all = state.todos ?? [];
  if (all.length === 0) return `${titleBar(0)}<p class="state empty">할 일이 없습니다</p>`;

  const shown = filterByRoute(all, hash);
  const { owner } = parseRoute(hash);
  const head = titleBar(all.length) + renderFilters(all, hash);
  if (shown.length === 0) {
    const who = owner === null ? '' : `'${escapeHtml(owner)}' 담당의 `;
    return `${head}<p class="state empty">${who}할 일이 없습니다</p>`;
  }
  return `${head}${renderTable(shown)}<p class="footer">총 ${shown.length}건</p>`;
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
