#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTodos } from '../src/toCsv.js';
import { countTodos, countByOwner, formatByOwner } from '../src/countTodos.js';

const USAGE = '사용법: todo-count [--by-owner] <할 일 JSON 파일>';

function fail(message) {
  process.stderr.write(`todo-count: ${message}\n`);
  process.exit(1);
}

let values;
let positionals;
try {
  ({ values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'by-owner': { type: 'boolean' } },
  }));
} catch (e) {
  fail(e.message);
}

if (positionals.length !== 1) fail(USAGE);

let text;
try {
  text = readFileSync(positionals[0], 'utf8');
} catch (e) {
  fail(`파일을 읽을 수 없습니다: ${positionals[0]} (${e.code ?? e.message})`);
}

let todos;
try {
  todos = parseTodos(text);
} catch (e) {
  fail(e.message);
}

if (values['by-owner']) {
  process.stdout.write(formatByOwner(countByOwner(todos)));
} else {
  process.stdout.write(`${countTodos(todos)}\n`);
}
