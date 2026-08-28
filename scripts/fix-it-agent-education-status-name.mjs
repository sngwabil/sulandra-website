import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'api', 'src', 'education-campaign-routes.ts');
const marker = 'IT_AGENT_EDUCATION_STATUS_NAME_V2';
const oldSelect = `SELECT assignment."employeeId",usr."displayName",usr."email",usr."role"::text AS "role",assignment."status",assignment."completedAt",assignment."legalEntityId"`;
const newSelect = `SELECT /* ${marker} */ assignment."employeeId",
       COALESCE(
         NULLIF(TRIM(CONCAT_WS(' ',
           to_jsonb(usr)->>'firstName',
           to_jsonb(usr)->>'middleName',
           to_jsonb(usr)->>'lastName'
         )), ''),
         NULLIF(to_jsonb(usr)->>'displayName', ''),
         usr."email",
         'Employee'
       ) AS "displayName",
       usr."email",usr."role"::text AS "role",assignment."status",assignment."completedAt",assignment."legalEntityId"`;

let source = await readFile(targetPath, 'utf8');

if (!source.includes(marker)) {
  if (!source.includes(oldSelect)) {
    throw new Error('IT Agent education status employee-name query anchor changed.');
  }
  source = source.replace(oldSelect, newSelect);
  await writeFile(targetPath, source, 'utf8');
  console.log('Repaired IT Agent education status employee-name projection.');
} else {
  console.log('IT Agent education status employee-name projection is already repaired.');
}

const verified = await readFile(targetPath, 'utf8');
if (!verified.includes(marker)) throw new Error('IT Agent education status employee-name repair marker is missing.');
if (verified.includes(oldSelect)) throw new Error('IT Agent education status still references User.displayName directly.');
if (!verified.includes("to_jsonb(usr)->>'firstName'")) throw new Error('IT Agent education status first-name fallback is missing.');
if (!verified.includes('AS "displayName"')) throw new Error('IT Agent education status displayName alias is missing.');
