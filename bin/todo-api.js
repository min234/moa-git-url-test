#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createTodoServer } from '../src/todoApi.js';

const USAGE = '사용법: todo-api <할 일 JSON 파일> [--port N]';

function fail(message) {
  process.stderr.write(`todo-api: ${message}\n`);
  process.exit(1);
}

let positionals;
let values;
try {
  ({ positionals, values } = parseArgs({
    allowPositionals: true,
    options: { port: { type: 'string' } },
  }));
} catch (e) {
  fail(e.message);
}

if (positionals.length !== 1) fail(USAGE);

const portText = values.port ?? process.env.PORT ?? '3001';
const port = Number(portText);
if (!/^\d+$/.test(portText) || port > 65535) fail(`포트가 올바르지 않습니다: ${portText}`);

const server = createTodoServer({ file: positionals[0] });
server.on('error', (e) => fail(`서버를 켤 수 없습니다: ${e.code ?? e.message}`));
server.listen(port, () => {
  process.stdout.write(`todo-api: http://localhost:${server.address().port}/todos\n`);
});
