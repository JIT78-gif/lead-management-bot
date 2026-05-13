import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const LoginBody = z.object({
  password: z.string().min(1, 'password required'),
});

function constantTimeStringEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still do a comparison of equal-length buffers to avoid a length-leak side channel.
    const pad = Buffer.alloc(ab.length);
    timingSafeEqual(ab, pad);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    if (!constantTimeStringEquals(parsed.data.password, config.dashboard.password)) {
      return reply.code(401).send({ error: 'invalid_password' });
    }

    req.session.set('authenticated', true);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req) => {
    req.session.delete();
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    return { authenticated: Boolean(req.session.get('authenticated')) };
  });
}
