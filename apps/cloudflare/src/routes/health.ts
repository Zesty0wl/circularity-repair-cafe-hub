import type { App } from '../lib/router.js';

export async function healthRoutes(app: App): Promise<void> {
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}
