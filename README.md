# Task Manager — Node.js + TypeScript (ESM)

A small backend service layer for managing **tasks** and **users**, written in TypeScript with
**strict mode**, compiled to native **ES Modules**, and built around **asynchronous operations**
(Promises and `async/await`) with explicit handling of success and failure cases.

Data is kept in memory behind an async repository that simulates database latency, so the code
behaves like a real I/O-bound backend without needing a database.

## Requirements checklist

| # | Requirement | Where it is implemented |
|---|---|---|
| 1 | Node.js backend using TypeScript and ESM | `"type": "module"` in `package.json`, `module: "NodeNext"` in `tsconfig.json`, `import`/`export` with `.js` specifiers, top-level `await` in `src/index.ts` |
| 2 | `Task` and `User` interfaces | `src/types.ts` (plus `TaskStatus`, `TaskPriority`, input types and a `Result<T>` union) |
| 3 | Async task operations with Promises / async-await | `src/taskService.ts`, `src/userService.ts`, `src/store.ts`, `src/utils.ts` (`delay` built with `new Promise`) |
| 4 | Success and failure cases | Typed errors in `src/errors.ts`, runtime validation in `src/validation.ts`, demo sections 1–5 in `src/index.ts`, 28 tests in `tests/` |
| 5 | Strict mode and npm scripts | `"strict": true` plus extra checks in `tsconfig.json`; scripts listed below |
| 6 | Verify, publish, document AI use | `npm run verify`, this repository, [AI usage](#ai-usage) section |

## Tech stack

- **Node.js** ≥ 20 (developed on Node 24)
- **TypeScript** 7 in strict mode
- **tsx** to run TypeScript directly during development and tests
- **node:test** and **node:assert** (built into Node, no test framework to install)
- No runtime dependencies

## Getting started

```bash
npm install
npm run build
npm start
```

### npm scripts

| Script | What it does |
|---|---|
| `npm run build` | Compiles `src/` to JavaScript in `dist/` (`tsc -p tsconfig.build.json`) |
| `npm start` | Runs the compiled demo: `node dist/index.js` |
| `npm run dev` | Runs `src/index.ts` directly and restarts on file changes (`tsx watch`) |
| `npm run typecheck` | Type-checks source and tests without writing files (`tsc --noEmit`) |
| `npm test` | Runs the test suite with the Node test runner |
| `npm run verify` | Runs typecheck, tests and build in sequence; fails if any step fails |

## Project structure

```
src/
├─ types.ts         Task, User, TaskStatus, TaskPriority, input types, Result<T>
├─ errors.ts        AppError and its subclasses: ValidationError, NotFoundError, ConflictError
├─ validation.ts    Runtime checks for input that may not match the TypeScript types
├─ utils.ts         delay() (a hand-made Promise) and toResult() (Promise -> Result)
├─ store.ts         InMemoryRepository<T>: generic async storage with simulated latency
├─ userService.ts   createUser, getUserById, listUsers
├─ taskService.ts   createTask, getTaskById, listTasks, updateTask, assignTask, completeTask, deleteTask
└─ index.ts         Demo: wires the services and runs success and failure scenarios
tests/
├─ taskService.test.ts
├─ userService.test.ts
└─ utils.test.ts
```

## Design

### Interfaces

```ts
type TaskStatus = 'pending' | 'in-progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high';

interface User {
  readonly id: string;
  name: string;
  email: string;
}

interface Task {
  readonly id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: User['id'];
  readonly createdAt: Date;
  updatedAt: Date;
}
```

### Async operations

Every service method returns a `Promise`. It **resolves** with the result on success and
**rejects** with an `AppError` on an expected failure:

| Operation | Success | Failure |
|---|---|---|
| `createTask(input)` | New task (`pending`, default priority `medium`) | `ValidationError` (blank or too long title, unknown priority), `NotFoundError` (assignee does not exist) |
| `getTaskById(id)` | The task | `NotFoundError` |
| `listTasks(filter?)` | Tasks matching `status` / `assigneeId` | — |
| `updateTask(id, changes)` | Updated task with a new `updatedAt` | `ValidationError` (no fields, invalid value), `NotFoundError` |
| `assignTask(taskId, userId)` | Task with the new assignee | `NotFoundError` (task or user), `ConflictError` (task already done) |
| `completeTask(id)` | Task with status `done` | `NotFoundError`, `ConflictError` (already done) |
| `deleteTask(id)` | Resolves with nothing | `NotFoundError` |
| `createUser(input)` | New user, email stored in lower case | `ValidationError`, `ConflictError` (email already used) |

The repository waits a configurable delay before each call to simulate database I/O, and
deep-copies records in and out with `structuredClone`, so callers cannot change stored data by
mutating an object they received.

### Handling success and failure

The demo (`npm start`) and the tests use several ways to handle results:

1. **`async/await` with `try/catch`.** Expected errors are recognised with the `isAppError()`
   type guard; anything else is treated as a real bug and rethrown.
2. **Promise chaining** with `.then()`, `.catch()` and `.finally()`.
3. **`Promise.all`** to run independent work in parallel. `assignTask` looks up the task and the
   user at the same time, and the demo creates two users at once.
4. **`Promise.allSettled`** to run a mixed batch where one failure does not hide the others.
5. **The `Result<T>` pattern.** `toResult(promise)` turns success and failure into plain values
   (`{ ok: true, value }` or `{ ok: false, error }`), so callers can handle both without
   `try/catch`.

Two details are easy to get wrong in async code:

- **Untyped input.** TypeScript types disappear at runtime, so input parsed from JSON is validated
  in `validation.ts`. For example, `priority: "urgent"` is rejected.
- **Race conditions.** `createUser` checks for a duplicate email and saves the user in two
  separate `await`s. An in-progress set, released in a `finally` block, stops two parallel calls
  with the same email from both succeeding. A test covers this case.

### Example output (`npm start`, shortened)

```
=== 1. Success cases (async/await) ===
  OK    Created users Alice and Bob in parallel (124 ms)
  OK    Created "Set up the project" [pending, high, -> Alice]
  OK    Completed "Set up the project" [done, high, -> Alice]

=== 2. Failure cases (try/catch with typed errors) ===
  FAIL  Create a task with a blank title: [VALIDATION_ERROR] Task title is required
  FAIL  Create a task with an unknown priority: [VALIDATION_ERROR] Task priority must be one of: low, medium, high (received "urgent")
  FAIL  Get a task that does not exist: [NOT_FOUND] Task with id "missing-id" was not found
  FAIL  Complete a task that is already done: [CONFLICT] Task "Set up the project" is already done

=== 4. Promise.allSettled (a mixed batch where one failure does not hide the rest) ===
  OK    #1 "Write unit tests" [pending, medium, -> Bob]
  FAIL  #2 [NOT_FOUND] Task with id "missing-id" was not found
  FAIL  #3 [VALIDATION_ERROR] Task title is required
  OK    #4 "Review pull request" [pending, medium, -> Alice]
```

## Verification

`npm run verify` runs the full check. At the time of writing:

- `tsc --noEmit` reports no type errors in strict mode.
- **28 tests pass** across 11 suites, covering every operation's success and failure paths,
  parallel duplicate-email creation, copy-on-read storage and the `Result` helper.
- `tsc` builds `dist/` and `node dist/index.js` exits with code 0.

## Limitations

- Data lives in memory, so it is lost when the process exits.
- There is no HTTP layer. The services are written so an HTTP API (for example Express) could
  call them directly.
- The duplicate-email guard protects a single process. A real database would enforce it with a
  unique index.

## AI usage

This project was built with the help of an AI coding assistant, as the assignment requires.

- **Tool:** Claude Code (Anthropic), model Claude Opus 5.5.
- **What the AI did:**
  - Explained the six requirements and proposed an implementation plan with options for each
    open decision.
  - Generated the project configuration (`package.json`, `tsconfig*.json`, `.gitignore`), the
    source code in `src/`, the tests in `tests/` and this README.
  - Ran the verification commands (typecheck, tests, build, demo). It also found and rewrote one
    test that did not check what its name said: the "email released after failure" test.
- **What I decided:**
  - A service layer with a console demo instead of a REST API.
  - In-memory storage instead of a database.
  - The built-in `node:test` runner instead of Jest.
  - A public GitHub repository.
  - An English README.
- **Review and responsibility:** I reviewed the generated code, ran `npm run verify` and
  `npm start` myself, and I am responsible for the submitted work.
