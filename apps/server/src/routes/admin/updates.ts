import type { FastifyInstance } from 'fastify';
import { updateStatus } from '../../services/updateCheck.js';

export async function adminUpdatesRoutes(app: FastifyInstance): Promise<void> {
  // Whether a newer version has been released. Admin only: it is nobody
  // else's business what a cafe is running, and it is not worth telling
  // visitors either.
  app.get('/api/admin/update', async (_request, reply) => {
    // Cheap and cached for a day, but let the browser hold it briefly too so
    // moving between admin pages does not keep asking.
    void reply.header('Cache-Control', 'private, max-age=300');
    return updateStatus();
  });
}
