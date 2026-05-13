import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { webhookRoutes } from './routes/webhook.js';
import { authRoutes } from './routes/auth.js';
import { leadsRoutes } from './routes/leads.js';
import { statsRoutes } from './routes/stats.js';
import { callsRoutes } from './routes/calls.js';
import { autoUploadRoutes } from './routes/auto-upload.js';
import { legalRoutes } from './routes/legal.js';

declare module '@fastify/secure-session' {
  interface SessionData {
    authenticated: boolean;
  }
}

export async function buildServer() {
  const app = Fastify({
    logger: { level: 'info' },
  });

  await app.register(cookie);

  // Deterministic 16-byte salt derived from the session secret — keeps env config
  // to one variable while satisfying @fastify/secure-session's PBKDF2 requirement.
  const salt = createHash('sha256')
    .update(config.dashboard.sessionSecret)
    .digest()
    .subarray(0, 16);

  await app.register(secureSession, {
    secret: config.dashboard.sessionSecret,
    salt,
    cookieName: 'session',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.audio.maxBytes,
      files: 1,
      fields: 4,
    },
  });

  await app.register(webhookRoutes);
  await app.register(authRoutes);
  await app.register(leadsRoutes);
  await app.register(statsRoutes);
  await app.register(callsRoutes);
  await app.register(autoUploadRoutes);
  await app.register(legalRoutes);

  // Serve the built React dashboard under /dashboard/* in production. In dev,
  // Vite runs the SPA on a separate port and proxies /api here.
  const dashboardDir = resolveDashboardDir();
  if (dashboardDir) {
    await app.register(fastifyStatic, {
      root: dashboardDir,
      prefix: '/dashboard/',
      // decorateReply defaults to true — needed so reply.sendFile() works below
    });

    // SPA fallback — any /dashboard/* path that isn't a static file serves
    // index.html so React Router can handle the route client-side.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/dashboard')) {
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: 'not_found' });
    });

    app.log.info(`Serving dashboard SPA from ${dashboardDir}`);
  } else {
    app.log.info('No dashboard build found; SPA served externally (dev mode)');
  }

  return app;
}

function resolveDashboardDir(): string | null {
  // In Docker runtime: /app/web/dist. In local dev (tsx): repo-root/web/dist.
  // Resolve relative to this module's location, then up to repo root.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // From src/server.ts (dev) or dist/server.js (prod), repo root is one level up.
  const candidates = [
    resolve(__dirname, '../web/dist'),
    resolve(__dirname, '../../web/dist'),
  ];
  for (const c of candidates) {
    if (existsSync(resolve(c, 'index.html'))) return c;
  }
  return null;
}
