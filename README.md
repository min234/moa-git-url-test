# moa-git-url-test

Moa 개발 실행(준비 보고서 → 개발 AI → 브랜치·커밋·초안 PR → 검토)을 처음부터 끝까지 시험하는 저장소입니다.

- 이 저장소는 비어 있어도 됩니다. 할 일에 맞는 코드와 시험을 **여기에 새로 만들어도 됩니다**.
- 작업은 `moa/…` 브랜치에서 하고, 초안(draft) PR까지만 만듭니다. main에 직접 커밋·병합하지 않습니다.
- 회사 제품(auto-work) 코드는 여기에 없습니다. 제품 코드를 고치는 일은 이 저장소로 하지 않습니다.

## todo-sort — 할 일 마감순 정렬 CLI

Node 18 이상, 외부 의존성 없음.

### 사용법

```bash
node bin/todo-sort.js <할 일 JSON 파일>
# 또는 npm link 뒤
todo-sort examples/todos-sort.json
npm test   # 시험 실행
```

- 인자가 없으면 사용법을 표준 오류에 쓰고 종료 코드 1.
- 파일을 못 읽거나 입력이 틀리면 `todo-sort: <이유>`를 표준 오류에 쓰고 종료 코드 1.
- 성공하면 정렬된 줄을 한 줄씩 표준 출력에 쓰고 종료 코드 0(빈 배열이면 출력 없음).

정렬 규칙: 마감(`due`) 오름차순, 같은 마감은 입력 순서 유지, 마감 없는 일(`due` 없음·`null`)은 입력 순서대로 맨 뒤.

### 입력 예시 (`examples/todos-sort.json`)

```json
[
  { "title": "회의록 정리", "due": "2026-11-20" },
  { "title": "견적서 보내기", "due": "2026-11-18" },
  { "title": "언젠가 할 일" },
  { "title": "월간 보고", "due": "2026-11-25" }
]
```

- 배열이어야 하고, 각 항목은 객체.
- `title`: 비어 있지 않은 문자열.
- `due`: 없음/`null` 또는 실제 있는 날짜 `YYYY-MM-DD`(예: `2026/11/20`, `2026-13-01`, `2026-02-30`은 오류).

### 출력 예시

```
2026-11-18 견적서 보내기
2026-11-20 회의록 정리
2026-11-25 월간 보고
(마감 없음) 언젠가 할 일
```

## todo-csv 사용법

할 일 JSON 배열(`[{ "title", "due", "owner" }]`)을 CSV로 바꿔 표준 출력에 씁니다: `node bin/todo-csv.js examples/todos.json > todos.csv`. 머리줄은 `title,due,owner`이고, 쉼표·큰따옴표·줄바꿈이 든 값은 RFC 4180대로 따옴표로 감쌉니다. 빠진 칸은 빈 칸, 마감일은 입력 값을 그대로 옮깁니다. 입력이 JSON 배열이 아니면 오류 메시지와 함께 종료 코드 1로 끝납니다. 시험: `npm test`.

## todo-group — 담당별로 묶어 보기

할 일 JSON 배열(`[{ "title", "due", "owner" }]`)을 담당(`owner`)별로 묶어 표준 출력에 보여 줍니다. Node 18 이상, 외부 의존성 없음.

```bash
node bin/todo-group.js examples/todos.json
# 또는 npm link 뒤
todo-group examples/todos.json
```

### 출력 예시

```
기획팀 (1)
  - 2026-11-20 주간 회의록 정리

개발팀 (1)
  - 2026-11-21 보고서, "초안"

(담당 없음) (1)
  - 2026-11-24 배포 점검
```

- 묶음마다 머리줄 `담당 (개수)`, 그 아래 항목마다 `  - 마감 제목`, 묶음 사이에 빈 줄 하나.
- 묶음 순서는 입력에서 처음 나온 순서, 묶음 안은 입력 순서.
- 담당은 앞뒤 공백을 지워 비교합니다(`" A "`와 `"A"`는 같은 묶음). 담당이 없거나 `null`·공백뿐이면 `(담당 없음)` 묶음으로 맨 뒤.
- 마감(`due`)이 없거나 `null`이면 `(마감 없음)`으로 표시합니다.
- 빈 배열이면 아무것도 쓰지 않고 종료 코드 0.

### 오류 규칙

인자가 1개가 아니거나, 파일을 못 읽거나, JSON이 아니거나, 배열이 아니거나, 객체가 아닌 항목이 있거나, `title`이 없거나 빈 문자열이면 `todo-group: <이유>`를 표준 오류에 쓰고 종료 코드 1로 끝납니다.

## todo-api — 할 일 목록 JSON API

할 일 JSON 파일을 HTTP로 내보내는 작은 서버입니다. 웹 화면이 `GET /todos`로 목록을 받아 씁니다. Node 18 이상, 외부 의존성 없음.

### 실행법

```bash
node bin/todo-api.js examples/todos.json            # 기본 포트: PORT 환경 변수, 없으면 3001
node bin/todo-api.js examples/todos.json --port 8080
npm run api                                          # 위 첫 줄과 같음(examples/todos.json, 기본 포트)
# 켜지면 표준 출력에 한 줄: todo-api: http://localhost:3001/todos
curl http://localhost:3001/todos
```

코드에서 쓸 때는 `import { createTodoServer } from './src/todoApi.js'`로 `createTodoServer({ file }).listen(port)`.

### 응답 예시

`GET /todos` → `200`, `Content-Type: application/json; charset=utf-8`, 본문은 검증된 할 일 배열 그대로:

```json
[
  { "title": "주간 회의록 정리", "due": "2026-11-20", "owner": "기획팀" },
  { "title": "보고서, \"초안\"", "due": "2026-11-21", "owner": "개발팀" },
  { "title": "배포 점검", "due": "2026-11-24" }
]
```

- 파일은 요청마다 새로 읽습니다. 파일을 고치면 다음 응답에 바로 반영됩니다.
- `HEAD /todos`는 같은 머리에 본문 없이 `200`.
- 쿼리 문자열은 무시합니다(`/todos?x=1`도 `/todos`).
- 모든 응답에 `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`. `OPTIONS`(아무 경로)는 `204`.

### 오류 규칙

| 상황 | 상태 | 본문 |
| --- | --- | --- |
| 파일을 못 읽음, JSON 아님, 배열 아님, 객체 아닌 항목, `title` 없음·빈 문자열, `due` 형식이 틀리거나 없는 날짜(예: `2026-02-30`) | 500 | `{"error":"<이유>"}` |
| `/todos`에 `GET`·`HEAD`·`OPTIONS` 밖의 메서드 | 405 | `{"error":"method not allowed"}` |
| 없는 경로 | 404 | `{"error":"not found"}` |

500이 나도 서버는 계속 살아 있고, 파일을 고치면 다음 요청부터 `200`이 됩니다.

명령줄 오류: 인자가 1개가 아니면 `todo-api: 사용법: todo-api <할 일 JSON 파일> [--port N]`을, 포트가 틀리거나 서버를 켤 수 없으면 `todo-api: <이유>`를 표준 오류에 쓰고 종료 코드 1.

## web — 할 일 목록 화면

`GET /todos` 결과를 목록으로 보여 주는 간단한 웹 화면입니다. 외부 의존성·빌드 없음.

```bash
npm run api          # API 켜기(http://localhost:3001/todos)
open web/index.html  # 브라우저로 열기
```

- 기본 API 주소는 `http://localhost:3001/todos`이고, 주소창에 `?api=<주소>`를 붙이면 바꿀 수 있습니다(예: `web/index.html?api=http://localhost:8080/todos`).
- 항목은 `마감 제목 (담당)`으로 보입니다. 마감이 없으면 `(마감 없음)`, 담당이 없으면 담당 표시를 생략합니다.
- 불러오는 동안 `불러오는 중…`, 할 일이 0건이면 `할 일이 없습니다`, 실패하면 `목록을 불러오지 못했습니다: <이유>`.
- 그리기·불러오기는 `web/todoView.js`의 순수 함수라 `npm test`(test/webView.test.js)로 시험합니다.

## replay-api — AI 세션 기록 재생 API

Claude Code 세션 기록(JSONL 파일 하나)을 받아 AI가 무엇을 읽고·고치고·돌렸는지 시간 순서의 단계 목록으로 바꿔 줍니다. 재생 화면이 이 목록으로 타임라인을 그립니다. Node 18 이상, 외부 의존성 없음. 기록은 저장하지 않고 요청마다 바꿔 돌려주기만 합니다.

### 실행법

```bash
node bin/replay-api.js              # 기본 포트: PORT 환경 변수, 없으면 3002
node bin/replay-api.js --port 8080
npm run replay-api                  # 위 첫 줄과 같음
# 켜지면 표준 출력에 한 줄: replay-api: http://localhost:3002/replay
curl -X POST --data-binary @examples/session-sample.jsonl http://localhost:3002/replay
```

코드에서 쓸 때는 `import { createReplayServer } from './src/replayApi.js'`, 변환만 쓸 때는 `import { parseSessionLog } from './src/replayLog.js'`.

### 응답 예시

`POST /replay`(본문 = 기록 파일 내용 그대로) → `200`, `Content-Type: application/json; charset=utf-8`:

```json
{
  "steps": [
    { "index": 0, "kind": "thinking", "label": "생각", "at": "2026-11-20T09:00:01.000Z", "durationMs": 1000, "summary": "먼저 README를 읽어 오타 위치를 찾는다.", "content": "…" },
    { "index": 1, "kind": "read", "label": "읽기", "at": "2026-11-20T09:00:02.000Z", "durationMs": 350, "summary": "읽기: README.md", "content": "…", "tool": "Read", "toolUseId": "toolu_read1" },
    { "index": 2, "kind": "result", "label": "결과", "at": "2026-11-20T09:00:02.350Z", "durationMs": 1650, "summary": "# 샘플", "content": "…", "toolUseId": "toolu_read1", "isError": false }
  ],
  "stats": { "lines": 10, "used": 8, "ignored": 2, "badLines": 0 }
}
```

### steps 칸 약속

| 칸 | 뜻 |
| --- | --- |
| `index` | 0부터 순서 번호 |
| `kind` / `label` | `read` 읽기 · `edit` 수정 · `command` 명령 · `result` 결과 · `thinking` 생각 |
| `at` | 그 줄의 시각(ISO 문자열) |
| `durationMs` | 도구 호출은 같은 `toolUseId` 결과까지, 그 밖은 다음 단계까지(밀리초). 알 수 없거나 마지막이면 `null` |
| `summary` | 120자 이하 한 줄 |
| `content` | 본문(20,000자 넘으면 잘리고 `…(잘림)`) |
| `tool`, `toolUseId`, `isError` | 도구 호출엔 `tool`·`toolUseId`, 결과엔 `toolUseId`·`isError` |

- 종류 나눔: Read·Grep·Glob·LS·WebFetch·WebSearch → 읽기, Edit·Write·MultiEdit·NotebookEdit → 수정, 그 밖의 도구(Bash 등) → 명령, 도구 결과 → 결과, thinking·text → 생각.
- `type`이 `user`·`assistant`인 줄만 씁니다. 다른 줄 종류(attachment 등)와 사용자 프롬프트(문자열 내용)는 `stats.ignored`, 깨진 JSON 줄은 `stats.badLines`로 세고 건너뜁니다.

### 오류 규칙

| 상황 | 상태 | 본문 |
| --- | --- | --- |
| 빈 본문, 쓸 단계가 하나도 없음 | 400 | `{"error":"<이유>","stats":{…}}` |
| 본문이 10MB 넘음 | 413 | `{"error":"<이유>"}` |
| `/replay`에 `POST`·`OPTIONS` 밖의 메서드 | 405 | `{"error":"method not allowed"}` |
| 없는 경로 | 404 | `{"error":"not found"}` |
| 그 밖의 예외 | 500 | `{"error":"기록을 처리하지 못했습니다"}` |

모든 응답에 `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`. `OPTIONS`(아무 경로)는 `204`. 쿼리 문자열은 무시합니다.

### 비밀 가림과 한계

`summary`·`content`에서 다음을 `[가림]`으로 바꿉니다: `sk-ant-…`·`sk-…` 키, `ghp_…`·`github_pat_…`, `xoxb-…` 같은 Slack 토큰, `AKIA…`, `Bearer …`, `password`·`passwd`·`secret`·`token` 뒤의 `=`/`:` 값, PEM 개인 키 덩어리. 정해진 패턴만 찾으므로 다른 모양의 비밀은 그대로 남을 수 있습니다 — 공유 전에 기록을 확인하세요. 명령줄 오류: 위치 인자가 있으면 사용법, 포트가 틀리거나 서버를 켤 수 없으면 `replay-api: <이유>`를 표준 오류에 쓰고 종료 코드 1.
