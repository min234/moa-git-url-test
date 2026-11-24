import { initState, renderPlayer, renderTimeline, renderDetail, renderControls, loadReplay, seek, next, prev, setSpeed, togglePlay, tick, dwellMs } from './replayView.js';

const DEFAULT_API = 'http://localhost:3002/replay';
const MIN_DWELL_MS = 120; // 걸린 시간이 0이어도 화면이 눈에 보이게 하는 바닥값
const api = new URLSearchParams(location.search).get('api') || DEFAULT_API;
const app = document.getElementById('app');

let state = initState();
let timer = null;

function paint() {
  app.innerHTML = renderPlayer(state);
  scrollCurrentIntoView();
  schedule();
}

// 스크러버를 끄는 동안에는 막대를 다시 그리지 않아 끌기가 끊기지 않게 한다.
function paintStep() {
  const steps = state.steps;
  document.getElementById('timeline').innerHTML = renderTimeline(steps, state.current);
  document.getElementById('detail').innerHTML = renderDetail(steps[state.current]);
  document.getElementById('pos').textContent = `${state.current + 1} / ${steps.length}`;
  scrollCurrentIntoView();
}

function scrollCurrentIntoView() {
  document.querySelector('.step[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
}

function schedule() {
  clearTimeout(timer);
  timer = null;
  if (state.status !== 'ok' || !state.playing) return;
  const wait = Math.max(MIN_DWELL_MS, dwellMs(state.steps[state.current], state.speed));
  timer = setTimeout(() => {
    state = tick(state);
    paint();
  }, wait);
}

function update(fn) {
  if (state.status !== 'ok') return;
  state = fn(state);
  paint();
}

async function openText(text) {
  clearTimeout(timer);
  state = initState({ status: 'loading' });
  paint();
  state = initState(await loadReplay(api, text));
  paint();
}

async function openFile(file) {
  if (!file) return;
  try {
    await openText(await file.text());
  } catch (e) {
    state = initState({ status: 'error', message: e?.message || '파일을 읽지 못했습니다' });
    paint();
  }
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.dataset.index !== undefined) update((s) => ({ ...seek(s, Number(el.dataset.index)), playing: false }));
  else if (el.dataset.speed !== undefined) update((s) => setSpeed(s, Number(el.dataset.speed)));
  else if (el.dataset.action === 'prev') update((s) => prev(s));
  else if (el.dataset.action === 'next') update((s) => next(s));
  else if (el.dataset.action === 'toggle') update((s) => togglePlay(s));
});

app.addEventListener('input', (e) => {
  if (e.target.id !== 'scrub' || state.status !== 'ok') return;
  state = { ...seek(state, Number(e.target.value)), playing: false };
  paintStep();
});
app.addEventListener('change', (e) => {
  if (e.target.id === 'scrub') paint(); // 끌기가 끝나면 막대(재생 버튼 글자 등)를 맞춘다
});

document.addEventListener('keydown', (e) => {
  if (state.status !== 'ok' || /^(INPUT|BUTTON|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === ' ') update((s) => togglePlay(s));
  else if (e.key === 'ArrowRight') update((s) => next(s));
  else if (e.key === 'ArrowLeft') update((s) => prev(s));
  else return;
  e.preventDefault();
});

document.getElementById('file').addEventListener('change', (e) => openFile(e.target.files[0]));
document.getElementById('sample').addEventListener('click', async () => {
  try {
    const res = await fetch('./sample.jsonl');
    if (!res.ok) throw new Error(`샘플을 받지 못했습니다(상태 ${res.status})`);
    await openText(await res.text());
  } catch (e) {
    state = initState({ status: 'error', message: e?.message || '샘플을 받지 못했습니다' });
    paint();
  }
});

const drop = document.getElementById('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  openFile(e.dataTransfer.files[0]);
});

paint();
