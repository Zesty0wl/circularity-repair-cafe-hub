import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

const securityPlugin = fp(async (app: FastifyInstance) => {
  await app.register(helmet, {
    // CSP is emitted by SvelteKit itself via a <meta http-equiv="content-security-policy">
    // tag in index.html (configured in apps/web/svelte.config.js with mode: 'hash').
    // SvelteKit knows the SHA-256 of its inline bootstrap script per build, so this
    // avoids needing 'unsafe-inline' here. Disabling helmet's CSP header prevents
    // a conflicting (overly strict) header from blanking the page.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });
});

export default securityPlugin;
