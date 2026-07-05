import { describe, it, expect, vi } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger, TEST_ADMIN } from '../test-support/fakes.js';
import { buildTestApp } from '../test-support/app.js';
import { createServices } from '../services/di.js';
import type { NewGameRow } from '../../db/schema.js';

function baseRow(bggId: number): NewGameRow {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return { bggId, type: 'base', hydrated: true, owned: true, played: false, createTime: now, name: `G${bggId}`, updateTime: now };
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('refresh routes (admin session)', () => {
  it('POST /api/refresh → 202 { started: true } and triggers a full run', async () => {
    const db = await makeTestDb();
    const services = createServices(db, silentLogger, makeFakeBgg());
    // Spy through so the real run still fires; on an empty library it settles at once.
    const startSpy = vi.spyOn(services.refresh, 'startAll');
    const app = await buildTestApp(services, db, { user: TEST_ADMIN });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/refresh' });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ started: true });
      expect(startSpy).toHaveBeenCalledTimes(1);

      const status = await app.inject({ method: 'GET', url: '/api/refresh/status' });
      expect(status.statusCode).toBe(200);
      expect(['idle', 'running']).toContain(status.json().state);
    } finally {
      await app.close();
    }
  });

  it('a second POST /api/refresh while a run is in flight → 409 REFRESH_RUNNING', async () => {
    const db = await makeTestDb();
    const fake = makeFakeBgg({ things: { 13: makeThing({ bggId: 13 }) } });
    const services = createServices(db, silentLogger, fake);
    await services.store.insertGame(baseRow(13));
    const app = await buildTestApp(services, db, { user: TEST_ADMIN });

    // Latch getThings so the background run parks mid-flight (state stays 'running')
    // deterministically — no wall-clock race against a run that finishes too fast.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const origGetThings = fake.getThings;
    fake.getThings = async (ids) => {
      await gate;
      return origGetThings(ids);
    };

    try {
      const first = await app.inject({ method: 'POST', url: '/api/refresh' });
      expect(first.statusCode).toBe(202);
      expect(services.refresh.isRunning).toBe(true);

      const second = await app.inject({ method: 'POST', url: '/api/refresh' });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('REFRESH_RUNNING');
    } finally {
      // Let the parked run drain before closing the db it writes to.
      release();
      for (let i = 0; i < 100 && services.refresh.getStatus().state !== 'idle'; i++) await tick();
      await app.close();
    }
  });
});
