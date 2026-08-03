import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repositoryRoot, 'api', 'src', 'onboarding-bootstrap.ts');
let source = await readFile(sourcePath, 'utf8');

source = source.replace(
  "  columnDefault: string | null;\n};",
  "  columnDefault: string | null;\n  enumValue: string | null;\n};",
);

source = source.replace(
  '           "column_default" AS "columnDefault"\n         FROM "information_schema"."columns"',
  '           "column_default" AS "columnDefault",\n           CASE\n             WHEN "data_type" = \'USER-DEFINED\' THEN (\n               SELECT enum_value."enumlabel"\n               FROM "pg_catalog"."pg_type" enum_type\n               JOIN "pg_catalog"."pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"\n               WHERE enum_type."typname" = "udt_name"\n               ORDER BY enum_value."enumsortorder"\n               LIMIT 1\n             )\n             ELSE NULL\n           END AS "enumValue"\n         FROM "information_schema"."columns"',
);

source = source.replace(
  "      const timestampLike = column.dataType.includes('timestamp') || column.udtName.includes('timestamp');\n\n      candidates.push({\n        name: column.columnName,\n        value: jsonLike ? metadataJson : booleanLike ? false : numericLike ? 0 : timestampLike ? new Date() : '',\n        cast: jsonLike ? '::jsonb' : undefined,\n      });",
  "      const timestampLike = column.dataType.includes('timestamp') || column.udtName.includes('timestamp');\n      const enumLike = column.dataType === 'USER-DEFINED' && Boolean(column.enumValue);\n      const quotedEnumType = enumLike ? column.udtName.replaceAll('\\\"', '\\\"\\\"') : '';\n\n      candidates.push({\n        name: column.columnName,\n        value: jsonLike ? metadataJson : booleanLike ? false : numericLike ? 0 : timestampLike ? new Date() : enumLike ? column.enumValue : '',\n        cast: jsonLike ? '::jsonb' : enumLike ? `::\"${quotedEnumType}\"` : undefined,\n      });",
);

await writeFile(sourcePath, source, 'utf8');
console.log('AuditEvent enum compatibility repair applied.');
