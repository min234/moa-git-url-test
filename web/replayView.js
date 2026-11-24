/** AI 작업 되감기 재생 화면의 순수 함수 모음(DOM·타이머를 쓰지 않아 브라우저와 Node 시험에서 같이 쓴다). */

export const MAX_UPLOAD = 10 * 1024 * 1024;
export const MAX_DWELL_MS = 3000;
export const DEFAULT_DWELL_MS = 1000;
export const SPEEDS = [1, 2, 4];
export const KIND_LABELS = { read: '읽기', edit: '수정', command: '명령', result: '결과', thinking: '생각' };

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 특수 문자를 글자로 바꾼다. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** 밀리초를 '1.2초'·'1분 3초'로, 없으면 '—'로 만든다. */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60000) return `${String(Math.round(ms / 100) / 10)}초`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
}

/** 시각(ISO 문자열)에서 시:분:초만 꺼낸다(시간대 변환 없이 기록 그대로). */
export function formatClock(at) {
  const m = typeof at === 'string' ? /T(\d{2}:\d{2}:\d{2})/.exec(at) : null;
  return m ? m[1] : '—';
}

const kindOf = (step) => (Object.hasOwn(KIND_LABELS, step?.kind) ? step.kind : 'other');
const labelOf = (step) => (typeof step?.label === 'string' && step.label ? step.label : (KIND_LABELS[step?.kind] ?? '기타'));

/** 단계 수·기록 길이(첫 시각~마지막 시각)·종류별 개수·건너뛴 줄 수를 모은다. */
export function summarizeSteps(steps, stats) {
  const list = Array.isArray(steps) ? steps : [];
  const counts = {};
  for (const s of list) counts[kindOf(s)] = (counts[kindOf(s)] ?? 0) + 1;
  const first = Date.parse(list[0]?.at);
  const last = Date.parse(list[list.length - 1]?.at);
  const totalMs = Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : null;
  const skipped = (stats?.ignored ?? 0) + (stats?.badLines ?? 0);
  return { count: list.length, totalMs, counts, skipped, badLines: stats?.badLines ?? 0 };
}

/** 요약 한 줄(글). */
export function formatSummary(sum) {
  const parts = [`단계 ${sum.count}개`, `기록 길이 ${formatDuration(sum.totalMs)}`];
  for (const k of Object.keys(KIND_LABELS)) if (sum.counts[k]) parts.push(`${KIND_LABELS[k]} ${sum.counts[k]}`);
  if (sum.skipped > 0) parts.push(`건너뛴 줄 ${sum.skipped}${sum.badLines > 0 ? `(깨진 줄 ${sum.badLines})` : ''}`);
  return parts.join(' · ');
}

/** 타임라인: 단계마다 번호·종류 칩·요약·시각·걸린 시간. 현재 단계에만 aria-current. */
export function renderTimeline(steps, current) {
  const items = steps
    .map((s, i) => {
      const k = kindOf(s);
      const err = s.isError === true;
      const cur = i === current ? ' aria-current="step"' : '';
      return (
        `<li><button type="button" class="step kind-${k}${err ? ' is-error' : ''}" data-index="${i}"${cur}>` +
        `<span class="num">${i + 1}</span>` +
        `<span class="chip kind-${k}">${escapeHtml(labelOf(s))}</span>` +
        (err ? '<span class="err-mark">오류</span>' : '') +
        `<span class="sum">${escapeHtml(s.summary)}</span>` +
        `<span class="meta">${escapeHtml(formatClock(s.at))} · ${escapeHtml(formatDuration(s.durationMs))}</span>` +
        '</button></li>'
      );
    })
    .join('');
  return `<ol class="timeline">${items}</ol>`;
}

/** 내용 창: 고른 단계의 종류·도구·시각·걸린 시간·본문. */
export function renderDetail(step) {
  if (!step) return '<p class="empty">단계가 없습니다</p>';
  const k = kindOf(step);
  const err = step.isError === true;
  const tool = step.tool ? ` · 도구 ${escapeHtml(step.tool)}` : '';
  return (
    `<div class="detail-head"><span class="chip kind-${k}">${escapeHtml(labelOf(step))}</span>` +
    (err ? '<span class="err-mark">오류 결과</span>' : '') +
    `<span class="meta">${escapeHtml(formatClock(step.at))} · 걸린 시간 ${escapeHtml(formatDuration(step.durationMs))}${tool}</span></div>` +
    '<p class="note">공유·캡처 전에 내용을 확인하세요. 비밀은 정해진 패턴만 가려집니다.</p>' +
    `<pre class="content${err ? ' is-error' : ''}">${escapeHtml(step.content)}</pre>`
  );
}

/** 재생 막대: 이전·재생/멈춤·다음·배속·스크러버·위치. */
export function renderControls(state) {
  const n = state.steps?.length ?? 0;
  const speeds = SPEEDS.map(
    (v) => `<button type="button" class="speed" data-speed="${v}" aria-pressed="${v === state.speed}">${v}x</button>`,
  ).join('');
  return (
    '<div class="controls">' +
    '<button type="button" data-action="prev" aria-label="이전 단계">이전</button>' +
    `<button type="button" data-action="toggle" aria-pressed="${state.playing === true}">${state.playing ? '멈춤' : '재생'}</button>` +
    '<button type="button" data-action="next" aria-label="다음 단계">다음</button>' +
    `<span class="speeds" role="group" aria-label="배속">${speeds}</span>` +
    `<input type="range" id="scrub" min="0" max="${Math.max(0, n - 1)}" value="${state.current}" aria-label="재생 위치">` +
    `<span id="pos" class="pos">${n === 0 ? 0 : state.current + 1} / ${n}</span>` +
    '</div>'
  );
}

/** 화면 상태(idle·loading·error·ok)를 HTML 문자열로 그린다. */
export function renderPlayer(state) {
  if (state.status === 'loading') return '<p class="loading">불러오는 중…</p>';
  if (state.status === 'error') {
    return `<p class="error" role="alert">기록을 불러오지 못했습니다: ${escapeHtml(state.message)}</p>`;
  }
  if (state.status !== 'ok') return '<p class="empty">기록(JSONL) 파일을 고르거나 끌어다 놓으세요</p>';
  const steps = state.steps ?? [];
  if (steps.length === 0) return '<p class="empty">재생할 단계가 없습니다</p>';
  return (
    `<p class="summary">${escapeHtml(formatSummary(summarizeSteps(steps, state.stats)))}</p>` +
    '<div class="layout">' +
    `<section class="pane" id="timeline" aria-label="타임라인">${renderTimeline(steps, state.current)}</section>` +
    `<section class="pane" id="detail" aria-label="단계 내용">${renderDetail(steps[state.current])}</section>` +
    '</div>' +
    `<div id="controls">${renderControls(state)}</div>`
  );
}

// ---- 재생 상태 전이(모두 새 상태를 돌려준다) ----

/** 불러온 결과({status,steps,stats} 또는 {status:'error'})에서 첫 화면 상태를 만든다. */
export function initState(result = { status: 'idle' }, speed = 1) {
  return { ...result, current: 0, playing: false, speed: SPEEDS.includes(speed) ? speed : 1 };
}

const lastIndex = (state) => Math.max(0, (state.steps?.length ?? 0) - 1);

export function seek(state, index) {
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return { ...state, current: Math.min(Math.max(i, 0), lastIndex(state)) };
}

export const next = (state) => seek(state, state.current + 1);
export const prev = (state) => seek(state, state.current - 1);

export function setSpeed(state, speed) {
  return SPEEDS.includes(speed) ? { ...state, speed } : state;
}

/** 재생/멈춤. 마지막 단계에서 재생을 누르면 처음부터 다시 시작한다. */
export function togglePlay(state) {
  if (!(state.steps?.length > 0)) return state;
  if (state.playing) return { ...state, playing: false };
  return { ...state, playing: true, current: state.current >= lastIndex(state) ? 0 : state.current };
}

/** 현재 단계에 머무는 시간(밀리초): 걸린 시간(없으면 1초)÷배속, 최대 3초. */
export function dwellMs(step, speed = 1) {
  const d = typeof step?.durationMs === 'number' && step.durationMs >= 0 ? step.durationMs : DEFAULT_DWELL_MS;
  return Math.min(MAX_DWELL_MS, d / (SPEEDS.includes(speed) ? speed : 1));
}

/** 머무는 시간이 지났을 때 한 칸 앞으로. 마지막 단계에 닿으면 재생을 멈춘다. */
export function tick(state) {
  if (!state.playing) return state;
  const moved = next(state);
  return moved.current >= lastIndex(moved) ? { ...moved, playing: false } : moved;
}

// ---- 불러오기 ----

/** text(기록 JSONL)를 POST url로 보내 화면 상태를 돌려준다. 예외를 밖으로 던지지 않는다. */
export async function loadReplay(url, text, fetchFn = globalThis.fetch) {
  const body = String(text ?? '');
  if (new TextEncoder().encode(body).length > MAX_UPLOAD) {
    return { status: 'error', message: `기록이 너무 큽니다(최대 ${MAX_UPLOAD}바이트)` };
  }
  let res;
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });
  } catch (e) {
    return { status: 'error', message: e?.message || '서버에 연결할 수 없습니다' };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 'error', message: `응답이 JSON이 아닙니다(상태 ${res.status})` };
  }
  if (res.status !== 200) {
    return { status: 'error', message: data && typeof data.error === 'string' ? data.error : `상태 ${res.status}` };
  }
  if (!data || !Array.isArray(data.steps)) return { status: 'error', message: '응답에 단계 목록이 없습니다' };
  return { status: 'ok', steps: data.steps, stats: data.stats ?? {} };
}
