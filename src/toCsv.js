export const HEADER = ['title', 'due', 'owner'];

/** JSON 텍스트를 파싱하고 배열인지 검증한다. 잘못되면 이유가 담긴 Error를 던진다. */
export function parseTodos(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON이 아닙니다: ${e.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('입력은 배열이어야 합니다');
  }
  data.forEach((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${i}번째 항목이 객체가 아닙니다`);
    }
  });
  return data;
}

/** RFC 4180: 쉼표·큰따옴표·줄바꿈이 있으면 큰따옴표로 감싸고 안의 큰따옴표는 두 번 쓴다. */
export function escapeCsv(value) {
  if (value === undefined || value === null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 할 일 배열을 CSV 텍스트(머리줄 포함, 줄 끝 \n)로 만든다. 빠진 칸은 빈 칸. */
export function toCsv(todos) {
  const lines = [HEADER.join(',')];
  for (const todo of todos) {
    lines.push(HEADER.map((key) => escapeCsv(todo[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
