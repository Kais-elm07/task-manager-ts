import { delay } from './utils.js';

/** Anything stored in a repository must have a string id. */
export interface Entity {
  readonly id: string;
}

/**
 * Generic in-memory storage that behaves like an asynchronous database.
 *
 * - Every method returns a Promise and waits `latencyMs` to simulate I/O.
 * - Records are deep-copied in and out (`structuredClone`), so callers cannot
 *   change stored data by mutating an object they received.
 */
export class InMemoryRepository<T extends Entity> {
  readonly #items = new Map<string, T>();
  readonly #latencyMs: number;

  constructor(latencyMs = 0) {
    this.#latencyMs = latencyMs;
  }

  async findById(id: string): Promise<T | undefined> {
    await delay(this.#latencyMs);
    const item = this.#items.get(id);
    return item === undefined ? undefined : structuredClone(item);
  }

  async findAll(predicate: (item: T) => boolean = () => true): Promise<T[]> {
    await delay(this.#latencyMs);
    return [...this.#items.values()].filter(predicate).map((item) => structuredClone(item));
  }

  /** Inserts a new record or replaces the record with the same id. */
  async save(item: T): Promise<T> {
    await delay(this.#latencyMs);
    this.#items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  /** Returns `true` if a record was removed, `false` if the id did not exist. */
  async delete(id: string): Promise<boolean> {
    await delay(this.#latencyMs);
    return this.#items.delete(id);
  }
}
