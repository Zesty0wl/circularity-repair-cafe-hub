import type { FastifyInstance } from 'fastify';
import { adminEventsRoutes } from './events.js';
import { adminVenuesRoutes } from './venues.js';
import { adminSkillsRoutes } from './skills.js';
import { adminUsersRoutes } from './users.js';
import { adminRepairsRoutes } from './repairs.js';
import { adminStatsRoutes } from './stats.js';
import { adminSettingsRoutes } from './settings.js';
import { adminUploadsRoutes } from './uploads.js';
import { adminDashboardRoutes } from './dashboard.js';
import { adminBoardRoutes } from './board.js';
import { adminBackupRoutes } from './backup.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireRole('super_admin', 'admin'));
  await app.register(adminDashboardRoutes);
  await app.register(adminEventsRoutes);
  await app.register(adminVenuesRoutes);
  await app.register(adminSkillsRoutes);
  await app.register(adminUsersRoutes);
  await app.register(adminRepairsRoutes);
  await app.register(adminStatsRoutes);
  await app.register(adminSettingsRoutes);
  await app.register(adminUploadsRoutes);
  await app.register(adminBoardRoutes);
  await app.register(adminBackupRoutes);
}
