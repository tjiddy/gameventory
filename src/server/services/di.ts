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

/** DI container. Routes depend on services; nothing depends on routes. */
export interface Services {
  bgg: BggPort;
  store: GameStore;
  games: GameService;
  refresh: RefreshService;
  search: SearchService;
  users: UserService;
  oidc: OidcService | null;
}

export function createServices(
  db: Db,
  log: FastifyBaseLogger,
  bgg: BggPort = new BggAdapter({ token: config.bggApiToken }),
): Services {
  const store = new GameStore(db);
  const refresh = new RefreshService(store, bgg, log);
  const games = new GameService(store, bgg, log, {
    onStubsCreated: (bggIds) => {
      void refresh.hydrateStubs(bggIds);
    },
  });
  const search = new SearchService(bgg, store);
  const users = new UserService(db);
  const oidc = config.oidc ? new OidcService(config.oidc) : null;
  return { bgg, store, games, refresh, search, users, oidc };
}
