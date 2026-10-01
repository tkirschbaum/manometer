import { createDatabase } from './client';
import { loadDotEnv, parseEnv } from '../env';

loadDotEnv();
const env = parseEnv();
const database = await createDatabase(env);
await database.migrate(env.migrationsDir);
await database.close();
console.log(`Migrations applied (${database.kind}).`);
