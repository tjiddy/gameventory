import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { UserService } from './user.service.js';
import type { UserRow } from '../../db/schema.js';

describe('UserService.ensureUser (§9)', () => {
  it('refreshes the persisted email on a second call for the same (provider, subject)', async () => {
    const users = new UserService(await makeTestDb());
    const now = new Date('2026-07-01T00:00:00.000Z');

    const first = await users.ensureUser('authelia', 'sub-1', 'Admin', 'old@example.com', now);
    const second = await users.ensureUser('authelia', 'sub-1', 'Admin', 'new@example.com', now);

    // Same row (upsert on the (provider, subject) unique key), email refreshed.
    expect(second.id).toBe(first.id);
    expect(second.email).toBe('new@example.com');
    expect((await users.getBySubject('authelia', 'sub-1'))?.email).toBe('new@example.com');
  });
});

describe('UserService.toAuthUser', () => {
  const row: UserRow = {
    id: 7,
    provider: 'authelia',
    subject: 'sub-7',
    email: null,
    displayName: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('falls back to subject when displayName is null', () => {
    expect(new UserService(null as never).toAuthUser(row).displayName).toBe('sub-7');
  });

  it('uses displayName when present', () => {
    expect(
      new UserService(null as never).toAuthUser({ ...row, displayName: 'Real Name' }).displayName,
    ).toBe('Real Name');
  });
});
