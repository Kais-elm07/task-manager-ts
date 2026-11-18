import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors.js';
import { InMemoryRepository } from '../src/store.js';
import type { User } from '../src/types.js';
import { UserService } from '../src/userService.js';

function createUserService(latencyMs = 0): UserService {
  return new UserService(new InMemoryRepository<User>(latencyMs));
}

describe('UserService', () => {
  it('creates a user with a trimmed name and a lower-case email', async () => {
    const users = createUserService();
    const user = await users.createUser({ name: ' Alice ', email: 'Alice@Example.com' });

    assert.equal(user.name, 'Alice');
    assert.equal(user.email, 'alice@example.com');
    assert.deepEqual(await users.getUserById(user.id), user);
  });

  it('rejects an invalid email with ValidationError', async () => {
    const users = createUserService();
    await assert.rejects(users.createUser({ name: 'Alice', email: 'not-an-email' }), ValidationError);
  });

  it('rejects a blank name with ValidationError', async () => {
    const users = createUserService();
    await assert.rejects(users.createUser({ name: '', email: 'alice@example.com' }), ValidationError);
  });

  it('rejects a duplicate email regardless of letter case', async () => {
    const users = createUserService();
    await users.createUser({ name: 'Alice', email: 'alice@example.com' });
    await assert.rejects(users.createUser({ name: 'Alice 2', email: 'ALICE@example.com' }), ConflictError);
  });

  it('rejects a duplicate email even when both requests run at the same time', async () => {
    const users = createUserService(10);
    const outcomes = await Promise.allSettled([
      users.createUser({ name: 'First', email: 'same@example.com' }),
      users.createUser({ name: 'Second', email: 'same@example.com' }),
    ]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'rejected'],
    );
    assert.ok(outcomes[1]?.status === 'rejected' && outcomes[1].reason instanceof ConflictError);
    assert.equal((await users.listUsers()).length, 1);
  });

  it('releases the email when saving fails, so a retry can succeed', async () => {
    /** A repository whose first save fails, like a database that is briefly unavailable. */
    class FlakyRepository extends InMemoryRepository<User> {
      #failNextSave = true;

      override async save(item: User): Promise<User> {
        if (this.#failNextSave) {
          this.#failNextSave = false;
          throw new Error('Database unavailable');
        }
        return super.save(item);
      }
    }

    const users = new UserService(new FlakyRepository());
    await assert.rejects(users.createUser({ name: 'Retry', email: 'retry@example.com' }), {
      message: 'Database unavailable',
    });
    const user = await users.createUser({ name: 'Retry', email: 'retry@example.com' });
    assert.equal(user.email, 'retry@example.com');
  });

  it('rejects a missing user id with NotFoundError', async () => {
    const users = createUserService();
    await assert.rejects(users.getUserById('missing'), NotFoundError);
  });
});
