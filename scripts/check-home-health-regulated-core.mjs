import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const requiredRelations = [
  'HomeHealthCertificationPeriod',
  'HomeHealthOasisSpecVersion',
  'HomeHealthOasisAssessment',
  'HomeHealthOasisEditFinding',
  'HomeHealthIqiesSubmission',
  'HomeHealthEpisodeTransition',
];

try {
  const relationRows = await prisma.$queryRawUnsafe(`
    SELECT unnest($1::text[]) AS name,
           to_regclass('public."' || unnest($1::text[]) || '"')::text AS relation
  `, requiredRelations);
  const missingRelations = relationRows.filter((row) => !row.relation).map((row) => row.name);
  if (missingRelations.length) throw new Error(`[home-health-regulated-core] missing required relations: ${missingRelations.join(', ')}`);

  const columns = await prisma.$queryRawUnsafe(`
    SELECT "table_name" AS "tableName", "column_name" AS "columnName"
      FROM information_schema.columns
     WHERE table_schema=current_schema()
       AND (
         (table_name='HomeHealthEpisode' AND column_name='currentCertificationPeriodId') OR
         (table_name='HomeHealthPlanOfCare' AND column_name IN ('certificationPeriodId','orderLifecycleStatus','signatureStatus')) OR
         (table_name='HomeHealthDisciplineOrder' AND column_name IN ('certificationPeriodId','orderType','signatureStatus','evvServiceCode')) OR
         (table_name='HomeHealthVisit' AND column_name IN ('certificationPeriodId','evvServiceCode')) OR
         (table_name='SpireEvvVisit' AND column_name='homeHealthVisitId')
       )
  `);
  const have = new Set(columns.map((row) => `${row.tableName}.${row.columnName}`));
  const requiredColumns = [
    'HomeHealthEpisode.currentCertificationPeriodId',
    'HomeHealthPlanOfCare.certificationPeriodId',
    'HomeHealthPlanOfCare.orderLifecycleStatus',
    'HomeHealthPlanOfCare.signatureStatus',
    'HomeHealthDisciplineOrder.certificationPeriodId',
    'HomeHealthDisciplineOrder.orderType',
    'HomeHealthDisciplineOrder.signatureStatus',
    'HomeHealthDisciplineOrder.evvServiceCode',
    'HomeHealthVisit.certificationPeriodId',
    'HomeHealthVisit.evvServiceCode',
    'SpireEvvVisit.homeHealthVisitId',
  ];
  const missingColumns = requiredColumns.filter((name) => !have.has(name));
  if (missingColumns.length) throw new Error(`[home-health-regulated-core] missing required columns: ${missingColumns.join(', ')}`);

  const runtimeObjects = await prisma.$queryRawUnsafe(`
    SELECT
      to_regprocedure('public.sync_home_health_canonical_evv_visit()')::text AS "syncFunction",
      EXISTS(
        SELECT 1
          FROM pg_trigger t
          JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname=current_schema()
           AND c.relname='HomeHealthVisit'
           AND t.tgname='HomeHealthVisit_canonical_evv_trg'
           AND NOT t.tgisinternal
      ) AS "syncTrigger",
      EXISTS(
        SELECT 1
          FROM pg_indexes
         WHERE schemaname=current_schema()
           AND indexname='SpireEvvVisit_home_health_visit_idx'
      ) AS "oneToOneIndex"
  `);
  const runtime = runtimeObjects[0] ?? {};
  if (!runtime.syncFunction) throw new Error('[home-health-regulated-core] canonical Home Health→EVV synchronization function is missing');
  if (runtime.syncTrigger !== true) throw new Error('[home-health-regulated-core] canonical Home Health→EVV synchronization trigger is missing');
  if (runtime.oneToOneIndex !== true) throw new Error('[home-health-regulated-core] Home Health→EVV one-to-one uniqueness index is missing');

  const specs = await prisma.$queryRawUnsafe(`
    SELECT "id","specName","itemSetVersionCode","submissionSpecVersion","status",
           jsonb_array_length("itemDefinitions")::int AS "itemDefinitionCount",
           jsonb_array_length("editRules")::int AS "editRuleCount"
      FROM "HomeHealthOasisSpecVersion"
     WHERE "itemSetVersionCode"='E2-042026' AND "submissionSpecVersion"='3.02'
     LIMIT 1
  `);
  if (!specs[0]) throw new Error('[home-health-regulated-core] OASIS-E2 / submission spec 3.02 is not registered');

  const linkProblems = await prisma.$queryRawUnsafe(`
    SELECT
      count(*) FILTER (
        WHERE hh."evvRequired"=TRUE
          AND hh."evvVisitId" IS NOT NULL
          AND evv_legacy."id" IS NULL
      )::int AS "danglingLegacyEvvLinks",
      count(*) FILTER (
        WHERE evv."homeHealthVisitId" IS NOT NULL
          AND (evv."organizationId"<>hh."organizationId" OR evv."patientId"<>hh."patientId")
      )::int AS "scopeMismatchLinks",
      count(*) FILTER (
        WHERE hh."evvRequired"=TRUE
          AND hh."status" IN ('IN_PROGRESS','COMPLETED')
          AND evv."id" IS NULL
      )::int AS "activeOrCompletedVisitsMissingCanonicalEvv",
      count(*) FILTER (
        WHERE hh."evvRequired"=TRUE
          AND hh."status"='SCHEDULED'
          AND evv."id" IS NULL
      )::int AS "scheduledVisitsMissingCanonicalEvv",
      count(*) FILTER (
        WHERE hh."evvRequired"=TRUE
          AND NULLIF(BTRIM(hh."evvServiceCode"),'') IS NULL
      )::int AS "evvRequiredVisitsMissingServiceCode",
      count(*) FILTER (
        WHERE evv."homeHealthVisitId"=hh."id"
          AND hh."evvVisitId" IS DISTINCT FROM evv."id"
      )::int AS "bidirectionalLinkMismatch"
    FROM "HomeHealthVisit" hh
    LEFT JOIN "SpireEvvVisit" evv ON evv."homeHealthVisitId"=hh."id"
    LEFT JOIN "SpireEvvVisit" evv_legacy ON evv_legacy."id"=hh."evvVisitId"
  `);
  const links = linkProblems[0] ?? {};
  if (Number(links.danglingLegacyEvvLinks || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.danglingLegacyEvvLinks} Home Health visit(s) reference a missing legacy EVV visit`);
  if (Number(links.scopeMismatchLinks || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.scopeMismatchLinks} EVV/Home Health visit link(s) cross organization/patient scope`);
  if (Number(links.activeOrCompletedVisitsMissingCanonicalEvv || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.activeOrCompletedVisitsMissingCanonicalEvv} EVV-required in-progress/completed Home Health visit(s) are not linked to the canonical SpireEvvVisit record`);
  if (Number(links.bidirectionalLinkMismatch || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.bidirectionalLinkMismatch} Home Health/EVV visit pair(s) have inconsistent bidirectional identifiers`);

  const operationalWarnings = await prisma.$queryRawUnsafe(`
    SELECT
      count(*) FILTER (WHERE e."status" IN ('ACTIVE','ON_HOLD') AND e."currentCertificationPeriodId" IS NULL)::int AS "activeEpisodesWithoutCertificationPeriod",
      count(*) FILTER (WHERE p."signatureStatus"='PENDING' AND p."signatureDueAt" IS NOT NULL AND p."signatureDueAt"<NOW())::int AS "overduePocSignatures",
      count(*) FILTER (WHERE o."signatureStatus"='PENDING' AND o."signatureDueAt" IS NOT NULL AND o."signatureDueAt"<NOW())::int AS "overdueOrderSignatures"
    FROM "HomeHealthEpisode" e
    LEFT JOIN "HomeHealthPlanOfCare" p ON p."episodeId"=e."id" AND p."status"<>'SUPERSEDED'
    LEFT JOIN "HomeHealthDisciplineOrder" o ON o."episodeId"=e."id" AND o."status" IN ('ORDERED','ACTIVE')
  `);

  const spec = specs[0];
  console.log('[home-health-regulated-core] PASS: regulated schema, synchronization trigger, and canonical Home Health↔EVV link integrity are valid.');
  console.log(`[home-health-regulated-core] OASIS spec registered: ${spec.specName} ${spec.itemSetVersionCode} / ${spec.submissionSpecVersion}; status=${spec.status}; items=${spec.itemDefinitionCount}; edits=${spec.editRuleCount}.`);
  if (spec.status === 'REGISTERED' || Number(spec.itemDefinitionCount) === 0 || Number(spec.editRuleCount) === 0) {
    console.warn('[home-health-regulated-core] OASIS submission remains intentionally blocked until the official CMS 3.02 item definitions/edit rules are loaded and validated.');
  }
  if (Number(links.scheduledVisitsMissingCanonicalEvv || 0) > 0) {
    console.warn(`[home-health-regulated-core] ${links.scheduledVisitsMissingCanonicalEvv} legacy EVV-required scheduled Home Health visit(s) still need canonical EVV linkage before they can start.`);
  }
  if (Number(links.evvRequiredVisitsMissingServiceCode || 0) > 0) {
    console.warn(`[home-health-regulated-core] ${links.evvRequiredVisitsMissingServiceCode} legacy EVV-required Home Health visit(s) are missing an explicit EVV service/procedure code; no code was guessed.`);
  }
  const warnings = operationalWarnings[0] ?? {};
  console.log(`[home-health-regulated-core] operational warnings: active episodes without certification period=${warnings.activeEpisodesWithoutCertificationPeriod ?? 0}; overdue POC signatures=${warnings.overduePocSignatures ?? 0}; overdue order signatures=${warnings.overdueOrderSignatures ?? 0}.`);
} finally {
  await prisma.$disconnect();
}
