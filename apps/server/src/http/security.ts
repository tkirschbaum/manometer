import type { FastifyInstance } from 'fastify';
import type { Env } from '../env';

/**
 * Security headers (§9). Caddy sets the same headers in production; setting them here too keeps local
 * mode (no Caddy) equally strict. Development (Vite middleware) skips the CSP because HMR needs inline scripts.
 */
export function registerSecurityHeaders(app: FastifyInstance, env: Env): void {
  const wss = `wss://${env.APP_DOMAIN}`;
  const publicWss = (() => {
    try {
      return `wss://${new URL(env.publicBaseUrl).host}`;
    } catch {
      return wss;
    }
  })();
  const connect = [`'self'`, wss, publicWss].filter((v, i, a) => a.indexOf(v) === i).join(' ');
  const participantCsp = `default-src 'self'; connect-src ${connect}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  // The add-in runs inside an Office webview: no frame restrictions, Office.js from Microsoft's CDN.
  const addinCsp = `default-src 'self'; script-src 'self' https://appsforoffice.microsoft.com; connect-src ${connect} https://appsforoffice.microsoft.com; img-src 'self' data: https://appsforoffice.microsoft.com; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'self'`;

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (env.publicBaseUrl.startsWith('https://') && env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000');
    }
    if (env.NODE_ENV !== 'development') {
      const isAddin = req.url.startsWith('/addin/') || req.url === '/addin';
      reply.header('Content-Security-Policy', isAddin ? addinCsp : participantCsp);
      if (!isAddin) reply.header('X-Frame-Options', 'DENY');
    }
    return payload;
  });
}
