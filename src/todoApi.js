import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseTodos } from './sortTodos.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

function send(req, res, status, body, extraHeaders = {}) {
  const headers = { ...CORS, ...extraHeaders };
  let payload = '';
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

/** 요청마다 file을 읽어 검증한 할 일 목록을 GET /todos로 돌려주는 node:http 서버를 만든다(listen은 부르는 쪽이). */
export function createTodoServer({ file }) {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
      }
      const path = (req.url ?? '/').split('?')[0];
      if (path !== '/todos') return send(req, res, 404, { error: 'not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET, HEAD, OPTIONS' });
      }
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch (e) {
        return send(req, res, 500, { error: `파일을 읽을 수 없습니다: ${file} (${e.code ?? e.message})` });
      }
      let todos;
      try {
        todos = parseTodos(text);
      } catch (e) {
        return send(req, res, 500, { error: e.message });
      }
      send(req, res, 200, todos);
    } catch (e) {
      if (!res.headersSent) send(req, res, 500, { error: e.message });
      else res.destroy();
    }
  });
}
