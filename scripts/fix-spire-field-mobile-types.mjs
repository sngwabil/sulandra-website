import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'src', 'spire-field-mobile-routes.ts');
let source = await readFile(target, 'utf8');
const before = `      const requested = Array.isArray(req.body?.scopes)\n        ? req.body.scopes.filter((value: unknown): value is string => typeof value === 'string')\n        : available;`;
const after = `      const requested: string[] = Array.isArray(req.body?.scopes)\n        ? (req.body.scopes as unknown[]).filter((value: unknown): value is string => typeof value === 'string')\n        : available;`;
if (source.includes(before)) source = source.replace(before, after);
if (!source.includes('const requested: string[] = Array.isArray(req.body?.scopes)')) {
  throw new Error('SPIRE field mobile OAuth scope typing marker was not found.');
}
await writeFile(target, source, 'utf8');
console.log('SPIRE field mobile OAuth request scope typing is build-safe.');
