#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTodos } from '../src/toCsv.js';
import { validateTitles, groupByOwner, formatGroups } from '../src/groupTodos.js';

const USAGE = '사용법: todo-group <할 일 JSON 파일>';

function fail(message) {
  process.stderr.write(`todo-group: ${message}\n`);
  process.exit(1);
}

let positionals;
try {
  ({ positionals } = parseArgs({ allowPositionals: true, options: {} }));
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
  todos = validateTitles(parseTodos(text));
} catch (e) {
  fail(e.message);
}

process.stdout.write(formatGroups(groupByOwner(todos)));
