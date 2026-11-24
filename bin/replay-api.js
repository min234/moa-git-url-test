#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createReplayServer } from '../src/replayApi.js';

const USAGE = '사용법: replay-api [--port N]';

function fail(message) {
  process.stderr.write(`replay-api: ${message}\n`);
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

if (positionals.length !== 0) fail(USAGE);

const portText = values.port ?? process.env.PORT ?? '3002';
const port = Number(portText);
if (!/^\d+$/.test(portText) || port > 65535) fail(`포트가 올바르지 않습니다: ${portText}`);

const server = createReplayServer();
server.on('error', (e) => fail(`서버를 켤 수 없습니다: ${e.code ?? e.message}`));
server.listen(port, () => {
  process.stdout.write(`replay-api: http://localhost:${server.address().port}/replay\n`);
});
