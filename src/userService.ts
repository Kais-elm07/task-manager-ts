import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import type { InMemoryRepository } from './store.js';
import type { CreateUserInput, User } from './types.js';
import { requireText } from './validation.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

export class UserService {
  readonly #users: InMemoryRepository<User>;
  /**
   * Emails whose creation is still in progress. Checking for a duplicate and saving are two
   * separate awaits, so without this two parallel calls with the same email could both pass the check.
   */
  readonly #emailsInProgress = new Set<string>();

  constructor(users: InMemoryRepository<User>) {
    this.#users = users;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const name = requireText(input.name, 'User name', MAX_NAME_LENGTH);
    const email = requireText(input.email, 'User email', MAX_EMAIL_LENGTH).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new ValidationError(`"${email}" is not a valid email address`);
    }

    if (this.#emailsInProgress.has(email)) {
      throw new ConflictError(`A user with email "${email}" already exists`);
    }
    this.#emailsInProgress.add(email);
    try {
      const sameEmail = await this.#users.findAll((user) => user.email === email);
      if (sameEmail.length > 0) {
        throw new ConflictError(`A user with email "${email}" already exists`);
      }
      return await this.#users.save({ id: randomUUID(), name, email });
    } finally {
      // Runs on success and on failure, so the email is never left reserved.
      this.#emailsInProgress.delete(email);
    }
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.#users.findById(id);
    if (user === undefined) {
      throw new NotFoundError('User', id);
    }
    return user;
  }

  listUsers(): Promise<User[]> {
    return this.#users.findAll();
  }
}
