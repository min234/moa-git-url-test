// Claude Code 세션 기록(JSONL)을 재생용 단계 목록으로 바꾸는 순수 함수 모음(입출력 없음).

export const MAX_CONTENT = 20000;
export const MAX_SUMMARY = 120;
const CUT = '…(잘림)';
const MASK = '[가림]';

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
export const LABELS = { read: '읽기', edit: '수정', command: '명령', result: '결과', thinking: '생각' };

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bxox[abp]-[A-Za-z0-9-]+/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
];
// password=값, "password": "값", token: 값 … — 이름은 남기고 값만 가린다.
const KEY_VALUE = /((?:["']?)\b(?:password|passwd|secret|token)\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi;

/** 비밀로 보이는 문자열을 [가림]으로 바꾼다(정해진 패턴만 — 모든 비밀을 잡지는 못한다). */
export function maskSecrets(text) {
  let out = String(text);
  for (const re of SECRET_PATTERNS) out = out.replace(re, MASK);
  return out.replace(KEY_VALUE, (_, name, value) => {
    const q = value[0] === '"' || value[0] === "'" ? value[0] : '';
    return `${name}${q}${MASK}${q}`;
  });
}

function clip(text, max, tail) {
  return text.length > max ? text.slice(0, max - tail.length) + tail : text;
}

function firstLine(text) {
  return (
    String(text)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l) ?? ''
  );
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

function str(v) {
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
}

function toolStep(block) {
  const name = typeof block.name === 'string' ? block.name : '';
  const input = block.input && typeof block.input === 'object' ? block.input : {};
  if (READ_TOOLS.has(name)) {
    const target = input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? '';
    return { kind: 'read', summary: `읽기: ${str(target)}`, content: JSON.stringify(input, null, 2) };
  }
  if (EDIT_TOOLS.has(name)) {
    const file = input.file_path ?? input.notebook_path ?? '';
    let content;
    if (typeof input.old_string === 'string' || typeof input.new_string === 'string') {
      content = `--- 이전\n${str(input.old_string)}\n+++ 이후\n${str(input.new_string)}`;
    } else if (Array.isArray(input.edits)) {
      content = input.edits.map((e) => `--- 이전\n${str(e?.old_string)}\n+++ 이후\n${str(e?.new_string)}`).join('\n\n');
    } else {
      content = str(input.content ?? input.new_source ?? '');
    }
    return { kind: 'edit', summary: `수정: ${str(file)}`, content };
  }
  const command = typeof input.command === 'string' ? input.command : '';
  const summary = typeof input.description === 'string' && input.description.trim()
    ? input.description
    : command
      ? firstLine(command)
      : name;
  return { kind: 'command', summary, content: command || JSON.stringify(input, null, 2) };
}

function blockStep(block) {
  if (!block || typeof block !== 'object') return null;
  if (block.type === 'thinking' && typeof block.thinking === 'string') {
    return { kind: 'thinking', summary: firstLine(block.thinking), content: block.thinking };
  }
  if (block.type === 'text' && typeof block.text === 'string') {
    return { kind: 'thinking', summary: firstLine(block.text), content: block.text };
  }
  if (block.type === 'tool_use') {
    return { ...toolStep(block), tool: str(block.name), toolUseId: str(block.id) };
  }
  if (block.type === 'tool_result') {
    const text = resultText(block.content);
    const isError = block.is_error === true;
    return {
      kind: 'result',
      summary: `${isError ? '(오류) ' : ''}${firstLine(text)}`,
      content: text,
      toolUseId: str(block.tool_use_id),
      isError,
    };
  }
  return null;
}

function toIso(ts) {
  const d = new Date(ts);
  return typeof ts === 'string' && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/** JSONL 글 전체 → {steps, stats}. 깨진 줄·모르는 줄은 건너뛰고 센다(줄 하나로 전체를 실패시키지 않는다). */
export function parseSessionLog(text) {
  const stats = { lines: 0, used: 0, ignored: 0, badLines: 0 };
  const raw = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    stats.lines += 1;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      stats.badLines += 1;
      continue;
    }
    if (!row || typeof row !== 'object' || (row.type !== 'user' && row.type !== 'assistant')) {
      stats.ignored += 1;
      continue;
    }
    const content = row.message?.content;
    const at = toIso(row.timestamp);
    if (!Array.isArray(content) || !at) {
      stats.ignored += 1; // 사용자 프롬프트(문자열)·시각 없는 줄
      continue;
    }
    let made = 0;
    for (const block of content) {
      const step = blockStep(block);
      if (step) {
        raw.push({ ...step, at });
        made += 1;
      }
    }
    if (made) stats.used += 1;
    else stats.ignored += 1;
  }

  const resultAt = new Map();
  for (const s of raw) if (s.kind === 'result' && s.toolUseId && !resultAt.has(s.toolUseId)) resultAt.set(s.toolUseId, s.at);

  const gap = (from, to) => (to == null ? null : Math.max(0, Date.parse(to) - Date.parse(from)));
  const steps = raw.map((s, index) => {
    const durationMs = s.tool !== undefined
      ? gap(s.at, resultAt.get(s.toolUseId) ?? null)
      : gap(s.at, raw[index + 1]?.at ?? null);
    const step = {
      index,
      kind: s.kind,
      label: LABELS[s.kind],
      at: s.at,
      durationMs,
      summary: clip(maskSecrets(s.summary), MAX_SUMMARY, '…'),
      content: clip(maskSecrets(s.content), MAX_CONTENT, CUT),
    };
    if (s.tool !== undefined) step.tool = s.tool;
    if (s.toolUseId) step.toolUseId = s.toolUseId;
    if (s.kind === 'result') step.isError = s.isError;
    return step;
  });
  return { steps, stats };
}
