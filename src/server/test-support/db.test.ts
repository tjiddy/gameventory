import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock `fs` so the sweep's readdirSync/rmSync are observable and inert. `vi.hoisted`
// keeps the mock fn identities stable and importable for assertions.
const fsMock = vi.hoisted(() => ({
  readdirSync: vi.fn<() => string[]>(() => []),
  rmSync: vi.fn(),
  mkdtempSync: vi.fn(() => '/tmp/gv-testdb-mock'),
}));
vi.mock('fs', () => fsMock);

import os from 'os';
import path from 'path';
import { sweepStaleTempDbsIfSupported } from './db.js';

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.readdirSync.mockReturnValue([]);
});

describe('sweepStaleTempDbsIfSupported — import-time sweep platform gate', () => {
  it('is a no-op on POSIX: never reads or removes from the shared tmpdir', () => {
    // A stale dir is present, but the POSIX gate must not touch it — deleting a
    // sibling worker's live temp DB is exactly the race this gate prevents.
    fsMock.readdirSync.mockReturnValue(['gv-testdb-stale']);
    sweepStaleTempDbsIfSupported('linux');
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.rmSync).not.toHaveBeenCalled();
  });

  it('sweeps only gv-testdb-* dirs on Windows', () => {
    fsMock.readdirSync.mockReturnValue(['gv-testdb-stale', 'unrelated-dir']);
    sweepStaleTempDbsIfSupported('win32');
    expect(fsMock.readdirSync).toHaveBeenCalledWith(os.tmpdir());
    expect(fsMock.rmSync).toHaveBeenCalledTimes(1);
    expect(fsMock.rmSync).toHaveBeenCalledWith(
      path.join(os.tmpdir(), 'gv-testdb-stale'),
      expect.objectContaining({ recursive: true, force: true }),
    );
  });

  it('swallows an rmSync failure on Windows (a live run still holds the dir)', () => {
    fsMock.readdirSync.mockReturnValue(['gv-testdb-held']);
    fsMock.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    });
    expect(() => sweepStaleTempDbsIfSupported('win32')).not.toThrow();
  });

  it('defaults to the real process.platform (import-time call is inert on POSIX CI)', () => {
    fsMock.readdirSync.mockReturnValue(['gv-testdb-stale']);
    sweepStaleTempDbsIfSupported();
    if (process.platform === 'win32') {
      expect(fsMock.readdirSync).toHaveBeenCalled();
    } else {
      expect(fsMock.readdirSync).not.toHaveBeenCalled();
    }
  });
});
