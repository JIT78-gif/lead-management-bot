import { buildServer } from './server.js';
import { config } from './config.js';

// Touch the db module so the schema runs on boot before any request.
import './db/client.js';

async function main(): Promise<void> {
  const app = buildServer();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Bot listening on :${config.port} (${config.nodeEnv})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
