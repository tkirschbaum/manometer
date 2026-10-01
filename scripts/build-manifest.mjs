// Generates the add-in manifests from apps/addin/manifest.template.xml (master prompt §6.2):
//   apps/addin/public/manifest.xml      for https://{APP_DOMAIN} (or PUBLIC_BASE_URL)
//   apps/addin/public/manifest.dev.xml  for https://localhost:3443
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const ADDIN_ID = '5ef13628-83ee-42bb-99d4-3c3c90124cbc';
const PRODUCT_NAME = /export const PRODUCT_NAME = '([^']+)'/.exec(
  readFileSync(join(root, 'packages/shared/src/constants.ts'), 'utf8'),
)?.[1];
if (!PRODUCT_NAME) throw new Error('PRODUCT_NAME not found in packages/shared/src/constants.ts');

const template = readFileSync(join(root, 'apps/addin/manifest.template.xml'), 'utf8');
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function render(origin, name) {
  const url = new URL(origin);
  if (url.protocol !== 'https:') throw new Error(`Office add-ins need HTTPS: ${origin}`);
  const xml = template
    .replaceAll('{{ORIGIN}}', url.origin)
    .replaceAll('{{ADDIN_ID}}', ADDIN_ID)
    .replaceAll('{{PRODUCT_NAME}}', escapeXml(PRODUCT_NAME))
    .replaceAll('{{PROVIDER}}', escapeXml(process.env.ADDIN_PROVIDER ?? 'TK Webwerk'));
  if (/\{\{\w+\}\}/.test(xml)) throw new Error('Unreplaced placeholder in manifest');
  writeFileSync(join(root, 'apps/addin/public', name), xml);
  console.log(`${name}: ${url.origin}`);
}

const production = process.env.PUBLIC_BASE_URL ?? `https://${process.env.APP_DOMAIN ?? 'localhost:3443'}`;
render(production, 'manifest.xml');
render('https://localhost:3443', 'manifest.dev.xml');
