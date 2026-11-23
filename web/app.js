import { loadTodos, renderTodos } from './todoView.js';

const DEFAULT_API = 'http://localhost:3001/todos';
const api = new URLSearchParams(location.search).get('api') || DEFAULT_API;
const app = document.getElementById('app');

app.innerHTML = renderTodos({ status: 'loading' });
loadTodos(api).then((state) => {
  app.innerHTML = renderTodos(state);
});
