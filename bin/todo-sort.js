#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTodos, sortTodos, formatTodo } from '../src/sortTodos.js';

const USAGE = '사용법: todo-sort <할 일 JSON 파일>';

function fail(message) {
  process.stderr.write(`todo-sort: ${message}\n`);
  process.exit(1);
}

let positionals;
try {
  ({ positionals } = parseArgs({ allowPositionals: true, options: {} }));
} catch (e) {
  fail(e.message);
}

if (positionals.length !== 1) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
}

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

for (const todo of sortTodos(todos)) {
  process.stdout.write(`${formatTodo(todo)}\n`);
}
