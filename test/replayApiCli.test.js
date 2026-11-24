import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/replay-api.js', import.meta.url));
const SAMPLE = readFileSync(new URL('../examples/session-sample.jsonl', import.meta.url), 'utf8');

function runArgs(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 5000, env: { ...process.env, ...env } });
}

test('CLI: 인자 없이 --port 0으로 켜면 주소 한 줄을 쓰고 POST /replay에 응답한다', async () => {
  const child = spawn(process.execPath, [BIN, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const line = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        out += d;
        if (out.includes('\n')) resolve(out);
      });
      child.on('exit', (code) => reject(new Error(`일찍 끝남: ${code}`)));
    });
    const m = line.match(/^replay-api: http:\/\/localhost:(\d+)\/replay\n$/);
    assert.ok(m, line);
    const r = await fetch(`http://localhost:${m[1]}/replay`, { method: 'POST', body: SAMPLE });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).steps.length, 8);
  } finally {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)));
  }
});

test('CLI 오류: 틀린 포트 → replay-api: 로 시작, 종료 코드 1', () => {
  for (const args of [['--port', 'abc'], ['--port', '70000'], ['--port', '-1']]) {
    const r = runArgs(args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /^replay-api: /);
    assert.equal(r.stdout, '');
  }
  const env = runArgs([], { PORT: 'x1' });
  assert.equal(env.status, 1);
  assert.equal(env.stderr, 'replay-api: 포트가 올바르지 않습니다: x1\n');
});

test('CLI 오류: 위치 인자 → 사용법, 종료 코드 1', () => {
  const r = runArgs(['file.jsonl']);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'replay-api: 사용법: replay-api [--port N]\n');
});
