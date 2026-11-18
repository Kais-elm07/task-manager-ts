/**
 * Entry point: wires the services together and runs a scripted demo that shows
 * every async operation succeeding and failing in a controlled way.
 */
import { isAppError } from './errors.js';
import { InMemoryRepository } from './store.js';
import { TaskService } from './taskService.js';
import type { CreateTaskInput, Task, User } from './types.js';
import { UserService } from './userService.js';
import { toResult } from './utils.js';

/** Simulated database latency (ms) for every repository call. */
const LATENCY_MS = 50;

const users = new UserService(new InMemoryRepository<User>(LATENCY_MS));
const tasks = new TaskService(new InMemoryRepository<Task>(LATENCY_MS), users);
const userNames = new Map<string, string>();

function heading(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function describeTask(task: Task): string {
  const assignee = task.assigneeId === undefined ? 'unassigned' : `-> ${userNames.get(task.assigneeId) ?? task.assigneeId}`;
  return `"${task.title}" [${task.status}, ${task.priority}, ${assignee}]`;
}

function describeError(error: unknown): string {
  return isAppError(error) ? `[${error.code}] ${error.message}` : String(error);
}

/** Runs one operation and prints whether it succeeded or failed with an expected `AppError`. */
async function attempt<T>(label: string, operation: () => Promise<T>): Promise<void> {
  try {
    await operation();
    console.log(`  OK    ${label}`);
  } catch (error) {
    if (!isAppError(error)) throw error; // Not an expected failure: let it surface as a real error.
    console.log(`  FAIL  ${label}: ${describeError(error)}`);
  }
}

async function main(): Promise<void> {
  heading('1. Success cases (async/await)');

  // Promise.all: both users are created at the same time instead of one after the other.
  const startedAt = performance.now();
  const [alice, bob] = await Promise.all([
    users.createUser({ name: 'Alice', email: 'alice@example.com' }),
    users.createUser({ name: 'Bob', email: 'bob@example.com' }),
  ]);
  const elapsed = Math.round(performance.now() - startedAt);
  for (const user of [alice, bob]) userNames.set(user.id, user.name);
  console.log(`  OK    Created users ${alice.name} and ${bob.name} in parallel (${elapsed} ms)`);

  const setup = await tasks.createTask({ title: 'Set up the project', priority: 'high', assigneeId: alice.id });
  console.log(`  OK    Created ${describeTask(setup)}`);
  const testing = await tasks.createTask({ title: 'Write unit tests', description: 'Cover success and failure cases' });
  console.log(`  OK    Created ${describeTask(testing)}`);
  const docs = await tasks.createTask({ title: 'Write the README', priority: 'low' });
  console.log(`  OK    Created ${describeTask(docs)}`);

  console.log(`  OK    Assigned ${describeTask(await tasks.assignTask(testing.id, bob.id))}`);
  console.log(`  OK    Updated ${describeTask(await tasks.updateTask(setup.id, { status: 'in-progress' }))}`);
  console.log(`  OK    Completed ${describeTask(await tasks.completeTask(setup.id))}`);

  const bobsTasks = await tasks.listTasks({ assigneeId: bob.id });
  console.log(`  OK    Bob has ${bobsTasks.length} task(s): ${bobsTasks.map(describeTask).join(', ')}`);

  heading('2. Failure cases (try/catch with typed errors)');

  // Input that arrives as JSON has no TypeScript types, so the services validate it at runtime.
  const untypedInput = JSON.parse('{ "title": "Deploy", "priority": "urgent" }') as CreateTaskInput;

  await attempt('Create a task with a blank title', () => tasks.createTask({ title: '   ' }));
  await attempt('Create a task with an unknown priority', () => tasks.createTask(untypedInput));
  await attempt('Get a task that does not exist', () => tasks.getTaskById('missing-id'));
  await attempt('Assign a task to a user that does not exist', () => tasks.assignTask(testing.id, 'ghost-user'));
  await attempt('Complete a task that is already done', () => tasks.completeTask(setup.id));
  await attempt('Update a task with no fields', () => tasks.updateTask(docs.id, {}));
  await attempt('Register an email that is already used', () =>
    users.createUser({ name: 'Alice Again', email: 'ALICE@example.com' }),
  );

  heading('3. Promise chaining (.then / .catch / .finally)');

  await tasks
    .getTaskById(docs.id)
    .then((task) => tasks.updateTask(task.id, { status: 'in-progress' }))
    .then((task) => console.log(`  OK    Chained update: ${describeTask(task)}`))
    .catch((error: unknown) => console.log(`  FAIL  ${describeError(error)}`))
    .finally(() => console.log('  ...   Chain 1 finished (finally always runs)'));

  await tasks
    .getTaskById('missing-id')
    .then((task) => tasks.completeTask(task.id))
    .then((task) => console.log(`  OK    Chained update: ${describeTask(task)}`))
    .catch((error: unknown) => console.log(`  FAIL  Chained update: ${describeError(error)}`))
    .finally(() => console.log('  ...   Chain 2 finished (finally always runs)'));

  heading('4. Promise.allSettled (a mixed batch where one failure does not hide the rest)');

  const outcomes = await Promise.allSettled([
    tasks.getTaskById(testing.id),
    tasks.getTaskById('missing-id'),
    tasks.createTask({ title: '' }),
    tasks.createTask({ title: 'Review pull request', assigneeId: alice.id }),
  ]);
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      console.log(`  OK    #${index + 1} ${describeTask(outcome.value)}`);
    } else {
      console.log(`  FAIL  #${index + 1} ${describeError(outcome.reason)}`);
    }
  });

  heading('5. Result pattern (success and failure as values, no try/catch)');

  for (const round of [1, 2]) {
    const result = await toResult(tasks.deleteTask(docs.id));
    if (result.ok) {
      console.log(`  OK    Delete #${round}: task deleted`);
    } else {
      console.log(`  FAIL  Delete #${round}: ${describeError(result.error)}`);
    }
  }

  heading('Final state');
  for (const task of await tasks.listTasks()) {
    console.log(`  -     ${describeTask(task)}`);
  }
}

// Top-level await is available because this file is an ES module.
try {
  await main();
} catch (error) {
  console.error('Unexpected error:', error);
  process.exitCode = 1;
}
