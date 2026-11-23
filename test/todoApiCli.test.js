import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/todo-api.js', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/todos.json', import.meta.url));

function runArgs(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 5000 });
}

test('CLI 오류: 인자 없음 → stderr가 todo-api: 로 시작, 종료 코드 1', () => {
  const r = runArgs([]);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'todo-api: 사용법: todo-api <할 일 JSON 파일> [--port N]\n');
  assert.equal(r.stdout, '');
});

test('CLI 오류: 인자 2개 → 종료 코드 1', () => {
  const r = runArgs([EXAMPLE, EXAMPLE]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^todo-api: /);
});

test('CLI: --port 0으로 켜면 주소 한 줄을 쓰고 GET /todos에 응답한다', async () => {
  const child = spawn(process.execPath, [BIN, EXAMPLE, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    const m = line.match(/^todo-api: http:\/\/localhost:(\d+)\/todos\n$/);
    assert.ok(m, line);
    const r = await fetch(`http://localhost:${m[1]}/todos`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, 3);
  } finally {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)));
  }
});
