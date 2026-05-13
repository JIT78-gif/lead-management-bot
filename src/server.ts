import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { webhookRoutes } from './routes/webhook.js';
import { authRoutes } from './routes/auth.js';
import { leadsRoutes } from './routes/leads.js';
import { statsRoutes } from './routes/stats.js';

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

  await app.register(webhookRoutes);
  await app.register(authRoutes);
  await app.register(leadsRoutes);
  await app.register(statsRoutes);

  return app;
}
