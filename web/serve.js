#!/usr/bin/env node
// web/ 폴더만 서빙하는 의존성 없는 정적 서버. file://에서는 ES 모듈이 막혀 이 서버로 연다.
// 실행: node web/serve.js [--port N]  →  http://localhost:3003/replay.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// '샘플 불러오기'용: web/ 밖의 파일은 이 한 줄(고정 경로)만 내보낸다.
const SAMPLE = fileURLToPath(new URL('../examples/session-sample.jsonl', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8',
};

/** 요청 경로를 web/ 안의 실제 파일 경로로 바꾼다. 밖으로 나가면 null. */
export function resolveRequest(urlPath, root = ROOT) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (p.includes('\0')) return null;
  if (p === '/sample.jsonl') return SAMPLE;
  if (p === '/') p = '/replay.html';
  const full = resolve(root, '.' + p);
  return full.startsWith(root.endsWith(sep) ? root : root + sep) ? full : null;
}

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const file = resolveRequest(req.url ?? '/', root);
    if (!file || file.endsWith(sep)) {
      res.writeHead(404);
      return res.end('not found');
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : Number(process.env.PORT) || 3003;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('serve: 포트가 올바르지 않습니다');
    process.exit(1);
  }
  const server = createStaticServer();
  server.on('error', (e) => {
    console.error(`serve: ${e.message}`);
    process.exit(1);
  });
  server.listen(port, () => console.log(`serve: http://localhost:${server.address().port}/replay.html`));
}
