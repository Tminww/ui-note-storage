import { loadDotEnv } from './env.mjs';
import { createApp } from './app.mjs';
loadDotEnv();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '127.0.0.1';
const app = createApp();
app.server.listen(port, host, () => {
  console.log(`Thoughts API: http://${host}:${port}/api/health`);
  console.log('Keep this API on a trusted local network; the MVP has no user authentication.');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
