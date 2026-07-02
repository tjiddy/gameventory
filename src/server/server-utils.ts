import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LISTEN_RETRY_DELAY_MS = 1000;

/**
 * Serve the built SPA (dist/client) and fall back to index.html for client-side
 * routes. API routes (/api/*) never fall through to the SPA — they 404 as JSON.
 * The app lives at the domain root; there is no URL_BASE/subpath support.
 */
export async function registerStaticAndSpa(app: FastifyInstance, clientPathOverride?: string) {
  const clientPath = clientPathOverride ?? path.join(__dirname, '../client');
  if (!fs.existsSync(clientPath)) return;

  const indexHtmlPath = path.join(clientPath, 'index.html');
  const rawIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

  function sendIndexHtml(reply: FastifyReply) {
    return reply.type('text/html').send(rawIndexHtml);
  }

  // Explicit HTML entry routes take priority over the static wildcard.
  app.get('/', (_request, reply) => sendIndexHtml(reply));
  app.get('/index.html', (_request, reply) => sendIndexHtml(reply));

  await app.register(fastifyStatic, {
    root: clientPath,
    prefix: '/',
    index: false,
    wildcard: true,
  });

  // SPA fallback for in-app routes; API routes 404 as JSON.
  app.setNotFoundHandler((request, reply) => {
    const urlPath = request.url.split('?')[0] ?? '/';
    if (urlPath.startsWith('/api/')) {
      return reply.status(404).send({ error: { message: 'Not found', code: 'NOT_FOUND' } });
    }
    return sendIndexHtml(reply);
  });
}

export async function listenWithRetry(
  app: FastifyInstance,
  port: number,
  host: string,
  maxRetries = 5,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await app.listen({ port, host });
      return;
    } catch (err: unknown) {
      const isAddrInUse =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (isAddrInUse && attempt < maxRetries) {
        app.log.warn({ port, attempt }, 'Port in use, retrying…');
        await new Promise((r) => setTimeout(r, LISTEN_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
}
