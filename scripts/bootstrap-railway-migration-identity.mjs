import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

const enabled = process.env.SULANDRA_RAILWAY_MIGRATION_BOOTSTRAP === '1';
const environment = String(process.env.SULANDRA_ENVIRONMENT || '').trim().toLowerCase();

if (!enabled) {
  console.log('[railway-migration-bootstrap] disabled; no identity rows changed.');
  process.exit(0);
}
if (environment !== 'staging') throw new Error('Railway migration identity bootstrap is staging-only.');

const required = [
  'DATABASE_URL',
  'MIGRATION_ORGANIZATION_ID',
  'MIGRATION_ORGANIZATION_NAME',
  'MIGRATION_ADMIN_USER_ID',
  'MIGRATION_ADMIN_EMAIL',
  'MIGRATION_ADMIN_FIRST_NAME',
  'MIGRATION_ADMIN_LAST_NAME',
];
for (const key of required) {
  if (!String(process.env[key] || '').trim()) throw new Error(`Missing required ${key}`);
}

const prisma = new PrismaClient();
const organizationId = process.env.MIGRATION_ORGANIZATION_ID.trim();
const organizationName = process.env.MIGRATION_ORGANIZATION_NAME.trim();
const userId = process.env.MIGRATION_ADMIN_USER_ID.trim();
const email = process.env.MIGRATION_ADMIN_EMAIL.trim().toLowerCase();
const firstName = process.env.MIGRATION_ADMIN_FIRST_NAME.trim();
const lastName = process.env.MIGRATION_ADMIN_LAST_NAME.trim();
const legalEntities = process.env.MIGRATION_LEGAL_ENTITIES_JSON
  ? JSON.parse(process.env.MIGRATION_LEGAL_ENTITIES_JSON)
  : [];
// Deliberately unrelated to the Supabase password. ADMIN_INITIAL_PASSWORD is the
// only staging login path; this value merely satisfies legacy NOT NULL schemas.
const syntheticPasswordHash = createHash('sha256').update(randomBytes(48)).digest('hex');

const quoteIdent = (value) => `"${String(value).replaceAll('"', '""')}"`;

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT ("id") DO UPDATE
       SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      organizationId,
      organizationName,
    );

    for (const entity of legalEntities) {
      if (!entity || entity.organizationId !== organizationId || !entity.id || !entity.code || !entity.legalName || !entity.displayName) {
        throw new Error('Invalid migration LegalEntity payload.');
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "LegalEntity"
          ("id","organizationId","code","legalName","displayName","entityType","status","parentLegalEntityId",
           "isEmployer","isProvider","branding","contact","metadata","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,NOW(),NOW())
         ON CONFLICT ("id") DO UPDATE SET
           "organizationId"=EXCLUDED."organizationId",
           "code"=EXCLUDED."code",
           "legalName"=EXCLUDED."legalName",
           "displayName"=EXCLUDED."displayName",
           "entityType"=EXCLUDED."entityType",
           "status"=EXCLUDED."status",
           "parentLegalEntityId"=EXCLUDED."parentLegalEntityId",
           "isEmployer"=EXCLUDED."isEmployer",
           "isProvider"=EXCLUDED."isProvider",
           "branding"=EXCLUDED."branding",
           "contact"=EXCLUDED."contact",
           "metadata"=EXCLUDED."metadata",
           "updatedAt"=NOW()`,
        entity.id,
        organizationId,
        entity.code,
        entity.legalName,
        entity.displayName,
        entity.entityType || 'OPERATING',
        entity.status || 'ACTIVE',
        entity.parentLegalEntityId || null,
        Boolean(entity.isEmployer),
        Boolean(entity.isProvider),
        JSON.stringify(entity.branding || {}),
        JSON.stringify(entity.contact || {}),
        JSON.stringify(entity.metadata || {}),
      );
    }

    const columns = await tx.$queryRawUnsafe(
      `SELECT column_name AS "name", is_nullable AS "nullable", column_default AS "defaultValue", udt_name AS "udtName"
         FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='User'
        ORDER BY ordinal_position`,
    );
    if (!Array.isArray(columns) || !columns.length) throw new Error('Railway User table is missing.');

    const existing = new Map(columns.map((column) => [String(column.name), column]));
    const requiredWithoutDefault = columns
      .filter((column) => column.nullable === 'NO' && column.defaultValue == null)
      .map((column) => String(column.name));

    const values = new Map([
      ['id', userId],
      ['organizationId', organizationId],
      ['email', email],
      ['username', email],
      ['personalEmail', null],
      ['firstName', firstName],
      ['middleName', null],
      ['lastName', lastName],
      ['phone', null],
      ['passwordHash', syntheticPasswordHash],
      ['isActive', true],
      ['active', true],
      ['mustChangePassword', false],
      ['mfaEnabled', false],
    ]);
    const special = new Set(['role', 'accountStatus', 'createdAt', 'updatedAt']);
    const unsupportedRequired = requiredWithoutDefault.filter((name) => !values.has(name) && !special.has(name));
    if (unsupportedRequired.length) {
      throw new Error(`Railway User schema has unsupported required columns: ${unsupportedRequired.join(', ')}`);
    }

    const conflicting = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "User" WHERE LOWER("email")=LOWER($1) AND "id"<>$2 LIMIT 1`,
      email,
      userId,
    );
    if (Array.isArray(conflicting) && conflicting.length) {
      throw new Error('A different Railway user already owns the migration administrator email.');
    }

    const insertColumns = [];
    const expressions = [];
    const params = [];
    for (const column of columns) {
      const name = String(column.name);
      if (name === 'role') {
        insertColumns.push(quoteIdent(name));
        expressions.push(`'ADMINISTRATOR'::"UserRole"`);
      } else if (name === 'accountStatus') {
        insertColumns.push(quoteIdent(name));
        expressions.push(`'ACTIVE'::"UserAccountStatus"`);
      } else if (name === 'createdAt' || name === 'updatedAt') {
        insertColumns.push(quoteIdent(name));
        expressions.push('NOW()');
      } else if (values.has(name)) {
        params.push(values.get(name));
        insertColumns.push(quoteIdent(name));
        expressions.push(`$${params.length}`);
      }
    }

    const updatable = ['organizationId','email','username','firstName','middleName','lastName','isActive','active','mustChangePassword','mfaEnabled','updatedAt']
      .filter((name) => existing.has(name));
    if (existing.has('role')) updatable.push('role');
    if (existing.has('accountStatus')) updatable.push('accountStatus');
    const updates = updatable.map((name) => `${quoteIdent(name)}=EXCLUDED.${quoteIdent(name)}`).join(', ');

    await tx.$executeRawUnsafe(
      `INSERT INTO "User" (${insertColumns.join(', ')}) VALUES (${expressions.join(', ')})
       ON CONFLICT ("id") DO UPDATE SET ${updates}`,
      ...params,
    );
  });

  console.log(`[railway-migration-bootstrap] Railway staging identity is ready with preserved IDs and ${legalEntities.length} legal entities; no Supabase password hash was copied.`);
} finally {
  await prisma.$disconnect();
}
