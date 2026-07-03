import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { users, type UserRow } from '../../db/schema.js';

export interface AuthUser {
  id: number;
  subject: string;
  displayName: string;
}

/** The single-admin user store for the Authelia session (MIGRATION-PLAN §9). */
export class UserService {
  constructor(private readonly db: Db) {}

  async getById(id: number): Promise<UserRow | undefined> {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  async getBySubject(provider: string, subject: string): Promise<UserRow | undefined> {
    return this.db
      .select()
      .from(users)
      .where(and(eq(users.provider, provider), eq(users.subject, subject)))
      .get();
  }

  /** Insert-or-fetch the user for (provider, subject); refresh the display name. */
  async ensureUser(
    provider: string,
    subject: string,
    displayName: string,
    email: string | null,
    now: Date,
  ): Promise<UserRow> {
    await this.db
      .insert(users)
      .values({ provider, subject, displayName, email, createdAt: now })
      .onConflictDoUpdate({ target: [users.provider, users.subject], set: { displayName, email } })
      .run();
    const row = await this.getBySubject(provider, subject);
    if (!row) throw new Error('user row vanished after upsert');
    return row;
  }

  toAuthUser(row: UserRow): AuthUser {
    return { id: row.id, subject: row.subject, displayName: row.displayName ?? row.subject };
  }
}
