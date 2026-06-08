import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  buildAuthUrl,
  disconnect,
  exchangeCode,
  getStatus,
  isConfigured,
} from '../services/google-oauth.js';

declare module '@fastify/secure-session' {
  interface SessionData {
    google_oauth_state?: string;
  }
}

export async function googleOAuthRoutes(app: FastifyInstance): Promise<void> {
  // ─── Status (auth-gated; the Settings page polls this) ───────
  app.get('/api/google/status', { preHandler: requireAuth }, async () => {
    return getStatus();
  });

  // ─── Start the consent flow ──────────────────────────────────
  // Returns the URL to redirect the browser to. We don't redirect
  // server-side because the dashboard wants to open it in the same
  // tab via JS so the session cookie survives.
  app.get('/api/auth/google/start', { preHandler: requireAuth }, async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(400).send({ error: 'not_configured' });
    }
    const state = randomBytes(24).toString('hex');
    req.session.set('google_oauth_state', state);
    return { url: buildAuthUrl(state) };
  });

  // ─── Callback (Google redirects back here) ───────────────────
  // We must allow this without dashboard auth — the user is mid-OAuth
  // and may have lost the session. We protect against CSRF via the
  // `state` token round-trip.
  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>('/api/auth/google/callback', async (req, reply) => {
    const { code, state, error } = req.query;

    if (error) {
      app.log.warn({ error }, 'Google OAuth callback returned error');
      return reply.redirect('/dashboard/settings?google=denied', 302);
    }
    if (!code) {
      return reply.redirect('/dashboard/settings?google=missing_code', 302);
    }

    const expectedState = req.session.get('google_oauth_state');
    if (!expectedState || expectedState !== state) {
      app.log.warn({ state, expectedState }, 'Google OAuth state mismatch');
      return reply.redirect('/dashboard/settings?google=state_mismatch', 302);
    }
    req.session.set('google_oauth_state', undefined);

    try {
      const result = await exchangeCode(code);
      app.log.info({ email: result.email }, 'Google OAuth connected');
      return reply.redirect('/dashboard/settings?google=connected', 302);
    } catch (err) {
      app.log.error({ err }, 'Google OAuth exchange failed');
      return reply.redirect('/dashboard/settings?google=exchange_failed', 302);
    }
  });

  // ─── Disconnect (auth-gated) ─────────────────────────────────
  app.post('/api/google/disconnect', { preHandler: requireAuth }, async () => {
    disconnect();
    return { ok: true };
  });
}
