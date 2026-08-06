import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(root, 'api', 'src', 'employee-management-routes.ts');
let source = await readFile(routePath, 'utf8');
source = source.replace(
  "personalEmail: z.string().trim().email().optional().nullable(),",
  "personalEmail: z.union([z.string().trim().email(), z.literal('')]).optional().nullable().transform((value) => value || null),",
);
await writeFile(routePath, source, 'utf8');
console.log('Employee 360 optional profile fields are build-safe.');
