import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),
    APP_DOMAIN: z.string().min(1).default('localhost:3443'),
    PUBLIC_BASE_URL: z.url().optional(),
    DATABASE_URL: z.string().optional(),
    PGLITE_DIR: z.string().default('.data/pglite'),
    EXPORT_TOKEN_SECRET: z.string().min(32).optional(),
    PARTICIPANT_HASH_SALT: z.string().min(16).optional(),
    RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TZ: z.string().default('Europe/Vienna'),
    DEV_CERTS: booleanish,
    TLS_CERT_FILE: z.string().optional(),
    TLS_KEY_FILE: z.string().optional(),
    TRUST_PROXY: booleanish,
    STATIC_DIR: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.EXPORT_TOKEN_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPORT_TOKEN_SECRET'],
        message: 'required in production (min. 32 chars)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.PARTICIPANT_HASH_SALT) {
      ctx.addIssue({
        code: 'custom',
        path: ['PARTICIPANT_HASH_SALT'],
        message: 'required in production (min. 16 chars)',
      });
    }
  });

export type RawEnv = z.output<typeof envSchema>;

export interface Env extends RawEnv {
  publicBaseUrl: string;
  exportTokenSecret: string;
  participantHashSalt: string;
  staticDir: string;
  migrationsDir: string;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Loads `.env` from the working directory or the repo root (no override of real env vars). */
export function loadDotEnv(): void {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(here, '../../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

function firstExisting(paths: string[]): string {
  return paths.find((p) => existsSync(p)) ?? paths[0] ?? '.';
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Empty values (e.g. `PUBLIC_BASE_URL=` or `${VAR:-}` in Docker Compose) count as unset.
  const result = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const env = result.data;
  const randomSecret = (): string => globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
  return {
    ...env,
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? `https://${env.APP_DOMAIN}`).replace(/\/+$/, ''),
    // Outside production a per-process secret is fine: tokens live 5 minutes.
    exportTokenSecret: env.EXPORT_TOKEN_SECRET ?? randomSecret(),
    participantHashSalt: env.PARTICIPANT_HASH_SALT ?? 'pulse-development-salt',
    // dist/index.js (bundled) sits one level below apps/server; src/env.ts two levels.
    staticDir: env.STATIC_DIR ?? firstExisting([resolve(here, '../..'), resolve(here, '../../..')]),
    migrationsDir: firstExisting([resolve(here, 'migrations'), resolve(here, 'db/migrations')]),
  };
}
