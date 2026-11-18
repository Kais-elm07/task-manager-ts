import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import type { InMemoryRepository } from './store.js';
import { TASK_PRIORITIES, TASK_STATUSES } from './types.js';
import type { CreateTaskInput, Task, TaskFilter, UpdateTaskInput } from './types.js';
import type { UserService } from './userService.js';
import { optionalText, requireOneOf, requireText } from './validation.js';

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority'] as const;

/**
 * Asynchronous task operations. Every method returns a Promise:
 * it resolves with the result on success and rejects with an `AppError` on an expected failure.
 */
export class TaskService {
  readonly #tasks: InMemoryRepository<Task>;
  readonly #users: UserService;

  constructor(tasks: InMemoryRepository<Task>, users: UserService) {
    this.#tasks = tasks;
    this.#users = users;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const title = requireText(input.title, 'Task title', MAX_TITLE_LENGTH);
    const description = optionalText(input.description, 'Task description', MAX_DESCRIPTION_LENGTH);
    const priority =
      input.priority === undefined ? 'medium' : requireOneOf(input.priority, TASK_PRIORITIES, 'Task priority');

    if (input.assigneeId !== undefined) {
      // Rejects with NotFoundError if the user does not exist; the rejection propagates to the caller.
      await this.#users.getUserById(input.assigneeId);
    }

    const now = new Date();
    const task: Task = { id: randomUUID(), title, status: 'pending', priority, createdAt: now, updatedAt: now };
    if (description !== undefined) task.description = description;
    if (input.assigneeId !== undefined) task.assigneeId = input.assigneeId;

    return this.#tasks.save(task);
  }

  async getTaskById(id: string): Promise<Task> {
    const task = await this.#tasks.findById(id);
    if (task === undefined) {
      throw new NotFoundError('Task', id);
    }
    return task;
  }

  listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    return this.#tasks.findAll(
      (task) =>
        (filter.status === undefined || task.status === filter.status) &&
        (filter.assigneeId === undefined || task.assigneeId === filter.assigneeId),
    );
  }

  async updateTask(id: string, changes: UpdateTaskInput): Promise<Task> {
    if (!UPDATABLE_FIELDS.some((field) => field in changes)) {
      throw new ValidationError(`Nothing to update. Allowed fields: ${UPDATABLE_FIELDS.join(', ')}`);
    }

    const task = await this.getTaskById(id);
    const updated: Task = { ...task, updatedAt: new Date() };

    if ('title' in changes) {
      updated.title = requireText(changes.title, 'Task title', MAX_TITLE_LENGTH);
    }
    if ('description' in changes) {
      const description = optionalText(changes.description, 'Task description', MAX_DESCRIPTION_LENGTH);
      if (description === undefined) delete updated.description;
      else updated.description = description;
    }
    if ('status' in changes) {
      updated.status = requireOneOf(changes.status, TASK_STATUSES, 'Task status');
    }
    if ('priority' in changes) {
      updated.priority = requireOneOf(changes.priority, TASK_PRIORITIES, 'Task priority');
    }

    return this.#tasks.save(updated);
  }

  async assignTask(taskId: string, userId: string): Promise<Task> {
    // Look up the task and the user at the same time. If either lookup rejects, Promise.all rejects.
    const [task] = await Promise.all([this.getTaskById(taskId), this.#users.getUserById(userId)]);
    if (task.status === 'done') {
      throw new ConflictError(`Task "${task.title}" is already done and cannot be reassigned`);
    }
    return this.#tasks.save({ ...task, assigneeId: userId, updatedAt: new Date() });
  }

  async completeTask(id: string): Promise<Task> {
    const task = await this.getTaskById(id);
    if (task.status === 'done') {
      throw new ConflictError(`Task "${task.title}" is already done`);
    }
    return this.#tasks.save({ ...task, status: 'done', updatedAt: new Date() });
  }

  async deleteTask(id: string): Promise<void> {
    const deleted = await this.#tasks.delete(id);
    if (!deleted) {
      throw new NotFoundError('Task', id);
    }
  }
}
