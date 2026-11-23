import { loadTodos, renderTodos } from './todoView.js';

const DEFAULT_API = 'http://localhost:3001/todos';
const api = new URLSearchParams(location.search).get('api') || DEFAULT_API;
const app = document.getElementById('app');

// 목록은 한 번만 불러오고, 해시가 바뀌면 받은 목록으로 다시 그린다.
let state = { status: 'loading' };
const draw = () => {
  app.innerHTML = renderTodos(state, location.hash || '#/');
};

draw();
window.addEventListener('hashchange', draw);
loadTodos(api).then((loaded) => {
  state = loaded;
  draw();
});
