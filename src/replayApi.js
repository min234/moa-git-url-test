import { createServer } from 'node:http';
import { parseSessionLog } from './replayLog.js';

export const MAX_BODY = 10 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(req, res, status, body) {
  const headers = { ...CORS };
  let payload = '';
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

class TooLarge extends Error {}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        reject(new TooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/** POST /replay 본문(JSONL)을 단계 목록으로 바꿔 돌려주는 node:http 서버를 만든다(listen은 부르는 쪽이). 기록은 저장하지 않는다. */
export function createReplayServer({ maxBody = MAX_BODY } = {}) {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
      }
      const path = (req.url ?? '/').split('?')[0];
      if (path !== '/replay') return send(req, res, 404, { error: 'not found' });
      if (req.method !== 'POST') return send(req, res, 405, { error: 'method not allowed' });
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBody) {
        res.setHeader('Connection', 'close');
        send(req, res, 413, { error: `기록이 너무 큽니다(최대 ${maxBody}바이트)` });
        req.resume();
        return;
      }
      let text;
      try {
        text = await readBody(req, maxBody);
      } catch (e) {
        if (e instanceof TooLarge) {
          res.setHeader('Connection', 'close');
          send(req, res, 413, { error: `기록이 너무 큽니다(최대 ${maxBody}바이트)` });
          req.resume();
          return;
        }
        throw e;
      }
      const result = parseSessionLog(text);
      if (result.steps.length === 0) {
        return send(req, res, 400, { error: '재생할 단계가 없습니다(빈 본문이거나 쓸 줄이 없음)', stats: result.stats });
      }
      send(req, res, 200, result);
    } catch {
      // 원문·비밀이 섞일 수 있어 예외 내용은 응답에 넣지 않는다.
      if (!res.headersSent) send(req, res, 500, { error: '기록을 처리하지 못했습니다' });
      else res.destroy();
    }
  });
}
