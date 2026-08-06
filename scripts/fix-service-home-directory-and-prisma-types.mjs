import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ownerEmail = 'admin@sulandrahealth.com';
const ownerName = 'Sulpitius Ndeh Gwabil';

const files = [
  path.join(root, 'api/src/service-home-management-routes.ts'),
  path.join(root, 'api/src/time-attendance-location-scheduler-routes.ts'),
];

for (const file of files) {
  let source = await readFile(file, 'utf8');

  // Prisma cannot deserialize PostgreSQL regclass values directly.
  source = source.replaceAll(
    `SELECT to_regclass('public.\"Client\"') AS table_name`,
    `SELECT to_regclass('public.\"Client\"')::text AS table_name`,
  );

  // Always show the enterprise owner's legal display name, never the login email.
  source = source.replaceAll(
    `COALESCE(NULLIF(c.\"displayName\",''),u.\"email\") AS \"displayName\"`,
    `CASE WHEN LOWER(u.\"email\")='${ownerEmail}' THEN '${ownerName}' ELSE COALESCE(NULLIF(c.\"displayName\",''),u.\"email\") END AS \"displayName\"`,
  );
  source = source.replaceAll(
    `ORDER BY COALESCE(NULLIF(c.\"displayName\",''),u.\"email\")`,
    `ORDER BY CASE WHEN LOWER(u.\"email\")='${ownerEmail}' THEN '${ownerName}' ELSE COALESCE(NULLIF(c.\"displayName\",''),u.\"email\") END`,
  );

  // Demo seed accounts are not real employees and must not appear in live scheduling/home assignment lists.
  source = source.replaceAll(
    `WHERE u.\"organizationId\"=$1 ORDER BY`,
    `WHERE u.\"organizationId\"=$1 AND LOWER(u.\"email\") NOT LIKE '%@demo.spire.local' ORDER BY`,
  );
  source = source.replaceAll(
    `WHERE x.\"organizationId\"=$1 AND x.\"locationId\"=$2 AND x.\"active\"=TRUE ORDER BY`,
    `WHERE x.\"organizationId\"=$1 AND x.\"locationId\"=$2 AND x.\"active\"=TRUE AND LOWER(u.\"email\") NOT LIKE '%@demo.spire.local' ORDER BY`,
  );

  await writeFile(file, source, 'utf8');
}

console.log('Service-home Prisma regclass queries, employee display names, and live directory filtering are repaired.');
