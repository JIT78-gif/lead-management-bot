import Fastify from 'fastify';
import { webhookRoutes } from './routes/webhook.js';

export function buildServer() {
  const app = Fastify({
    logger: { level: 'info' },
  });

  app.register(webhookRoutes);

  return app;
}
