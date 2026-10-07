// The Worker the tests run against: the API on its own, without the web app,
// so the tests do not need a web build. src/worker.ts adds the web app.
import { handleApi } from '../src/app.js';
import { runScheduled } from '../src/scheduled.js';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleApi(request);
  },
  async scheduled(controller: ScheduledController, _env: unknown, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(controller.scheduledTime));
  },
} satisfies ExportedHandler;
