import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getDashboardStats } from '../services/stats.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/stats', async () => {
    return getDashboardStats();
  });
}
