import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * preHandler hook — rejects the request with 401 unless the session has
 * `authenticated: true` set by a successful /api/auth/login.
 *
 * Use via app.register or scoped per-route prefix in server.ts.
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!req.session.get('authenticated')) {
    reply.code(401).send({ error: 'not_authenticated' });
  }
}
