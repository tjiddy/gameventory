import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/index.js';
import { BggAdapter, type BggPort } from '../../core/bgg/index.js';
import { config } from '../config.js';
import { GameStore } from './game-store.js';
import { GameService } from './game.service.js';
import { RefreshService } from './refresh.service.js';
import { SearchService } from './search.service.js';
import { UserService } from './user.service.js';
import { OidcService } from './oidc.service.js';
import { BackupService } from './backup.service.js';
import { OperationLock } from './operation-lock.js';

/** DI container. Routes depend on services; nothing depends on routes. */
export interface Services {
  bgg: BggPort;
  store: GameStore;
  games: GameService;
  refresh: RefreshService;
  search: SearchService;
  users: UserService;
  oidc: OidcService | null;
  backups: BackupService;
}

export function createServices(
  db: Db,
  log: FastifyBaseLogger,
  bgg: BggPort = new BggAdapter({ token: config.bggApiToken }),
): Services {
  // One shared reader-writer lock guards every library writer/snapshotter: restore
  // (exclusive) vs refresh, game mutations, stub hydration, and backup create (shared).
  const lock = new OperationLock();
  const store = new GameStore(db);
  const refresh = new RefreshService(store, bgg, log, lock);
  const games = new GameService(
    store,
    bgg,
    log,
    {
      onStubsCreated: (bggIds) => {
        void refresh.hydrateStubs(bggIds);
      },
    },
    lock,
  );
  const search = new SearchService(bgg, store);
  const users = new UserService(db);
  const oidc = config.oidc ? new OidcService(config.oidc) : null;
  const backups = new BackupService(
    db,
    store,
    log,
    { backupDir: config.backupDir, retention: config.backupRetention },
    lock,
  );
  return { bgg, store, games, refresh, search, users, oidc, backups };
}
