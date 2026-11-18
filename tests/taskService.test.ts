import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors.js';
import { InMemoryRepository } from '../src/store.js';
import { TaskService } from '../src/taskService.js';
import type { CreateTaskInput, Task, UpdateTaskInput, User } from '../src/types.js';
import { UserService } from '../src/userService.js';

function createServices(latencyMs = 0) {
  const users = new UserService(new InMemoryRepository<User>(latencyMs));
  const tasks = new TaskService(new InMemoryRepository<Task>(latencyMs), users);
  return { users, tasks };
}

describe('TaskService', () => {
  describe('createTask', () => {
    it('creates a pending task with medium priority by default', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: '  Write code  ' });

      assert.equal(task.title, 'Write code');
      assert.equal(task.status, 'pending');
      assert.equal(task.priority, 'medium');
      assert.equal(task.assigneeId, undefined);
      assert.ok(task.createdAt instanceof Date);
      assert.deepEqual(await tasks.getTaskById(task.id), task);
    });

    it('stores the description and the assignee', async () => {
      const { users, tasks } = createServices();
      const user = await users.createUser({ name: 'Alice', email: 'alice@example.com' });
      const task = await tasks.createTask({ title: 'Review', description: 'Check PR', assigneeId: user.id });

      assert.equal(task.description, 'Check PR');
      assert.equal(task.assigneeId, user.id);
    });

    it('rejects a blank title with ValidationError', async () => {
      const { tasks } = createServices();
      await assert.rejects(tasks.createTask({ title: '   ' }), ValidationError);
    });

    it('rejects an unknown priority coming from untyped input', async () => {
      const { tasks } = createServices();
      const input = JSON.parse('{ "title": "Deploy", "priority": "urgent" }') as CreateTaskInput;
      await assert.rejects(tasks.createTask(input), { name: 'ValidationError', code: 'VALIDATION_ERROR' });
    });

    it('rejects an assignee that does not exist with NotFoundError', async () => {
      const { tasks } = createServices();
      await assert.rejects(tasks.createTask({ title: 'Deploy', assigneeId: 'ghost' }), NotFoundError);
      assert.equal((await tasks.listTasks()).length, 0, 'no task should be saved');
    });
  });

  describe('getTaskById', () => {
    it('rejects a missing id with NotFoundError', async () => {
      const { tasks } = createServices();
      await assert.rejects(tasks.getTaskById('missing'), {
        name: 'NotFoundError',
        code: 'NOT_FOUND',
        message: 'Task with id "missing" was not found',
      });
    });

    it('returns copies, so changing a returned task does not change stored data', async () => {
      const { tasks } = createServices();
      const created = await tasks.createTask({ title: 'Original' });
      const copy = await tasks.getTaskById(created.id);
      copy.title = 'Changed outside the service';

      assert.equal((await tasks.getTaskById(created.id)).title, 'Original');
    });
  });

  describe('updateTask', () => {
    it('updates the given fields and bumps updatedAt', async () => {
      const { tasks } = createServices(5);
      const task = await tasks.createTask({ title: 'Draft', description: 'old' });
      const updated = await tasks.updateTask(task.id, { title: 'Final', status: 'in-progress', description: '' });

      assert.equal(updated.title, 'Final');
      assert.equal(updated.status, 'in-progress');
      assert.equal(updated.description, undefined, 'blank description clears it');
      assert.equal(updated.createdAt.getTime(), task.createdAt.getTime());
      assert.ok(updated.updatedAt.getTime() > task.updatedAt.getTime());
    });

    it('rejects an update without any allowed field', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: 'Draft' });
      await assert.rejects(tasks.updateTask(task.id, {}), ValidationError);
    });

    it('rejects an invalid status and keeps the task unchanged', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: 'Draft' });
      const changes = JSON.parse('{ "status": "archived" }') as UpdateTaskInput;

      await assert.rejects(tasks.updateTask(task.id, changes), ValidationError);
      assert.equal((await tasks.getTaskById(task.id)).status, 'pending');
    });

    it('rejects a missing task with NotFoundError', async () => {
      const { tasks } = createServices();
      await assert.rejects(tasks.updateTask('missing', { status: 'done' }), NotFoundError);
    });
  });

  describe('assignTask', () => {
    it('assigns a task to an existing user', async () => {
      const { users, tasks } = createServices();
      const user = await users.createUser({ name: 'Bob', email: 'bob@example.com' });
      const task = await tasks.createTask({ title: 'Test' });

      const assigned = await tasks.assignTask(task.id, user.id);
      assert.equal(assigned.assigneeId, user.id);
    });

    it('rejects a missing user and leaves the task unassigned', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: 'Test' });

      await assert.rejects(tasks.assignTask(task.id, 'ghost'), NotFoundError);
      assert.equal((await tasks.getTaskById(task.id)).assigneeId, undefined);
    });

    it('rejects reassigning a task that is already done', async () => {
      const { users, tasks } = createServices();
      const user = await users.createUser({ name: 'Bob', email: 'bob@example.com' });
      const task = await tasks.createTask({ title: 'Test' });
      await tasks.completeTask(task.id);

      await assert.rejects(tasks.assignTask(task.id, user.id), ConflictError);
    });
  });

  describe('completeTask', () => {
    it('marks a task as done once and rejects a second completion', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: 'Ship it' });

      assert.equal((await tasks.completeTask(task.id)).status, 'done');
      await assert.rejects(tasks.completeTask(task.id), ConflictError);
    });
  });

  describe('deleteTask', () => {
    it('deletes a task, then rejects deleting it again', async () => {
      const { tasks } = createServices();
      const task = await tasks.createTask({ title: 'Temporary' });

      await tasks.deleteTask(task.id);
      await assert.rejects(tasks.getTaskById(task.id), NotFoundError);
      await assert.rejects(tasks.deleteTask(task.id), NotFoundError);
    });
  });

  describe('listTasks', () => {
    it('filters by status and by assignee', async () => {
      const { users, tasks } = createServices();
      const user = await users.createUser({ name: 'Alice', email: 'alice@example.com' });
      const first = await tasks.createTask({ title: 'One', assigneeId: user.id });
      await tasks.createTask({ title: 'Two' });
      await tasks.completeTask(first.id);

      assert.equal((await tasks.listTasks()).length, 2);
      assert.deepEqual((await tasks.listTasks({ status: 'done' })).map((t) => t.title), ['One']);
      assert.deepEqual((await tasks.listTasks({ status: 'pending' })).map((t) => t.title), ['Two']);
      assert.deepEqual((await tasks.listTasks({ assigneeId: user.id })).map((t) => t.title), ['One']);
    });
  });
});
