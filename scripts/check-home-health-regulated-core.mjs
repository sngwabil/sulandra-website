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
         (table_name='HomeHealthDisciplineOrder' AND column_name IN ('certificationPeriodId','orderType','signatureStatus')) OR
         (table_name='HomeHealthVisit' AND column_name='certificationPeriodId') OR
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
    'HomeHealthVisit.certificationPeriodId',
    'SpireEvvVisit.homeHealthVisitId',
  ];
  const missingColumns = requiredColumns.filter((name) => !have.has(name));
  if (missingColumns.length) throw new Error(`[home-health-regulated-core] missing required columns: ${missingColumns.join(', ')}`);

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
      )::int AS "completedOrActiveVisitsMissingCanonicalEvv"
    FROM "HomeHealthVisit" hh
    LEFT JOIN "SpireEvvVisit" evv ON evv."homeHealthVisitId"=hh."id"
    LEFT JOIN "SpireEvvVisit" evv_legacy ON evv_legacy."id"=hh."evvVisitId"
  `);
  const links = linkProblems[0] ?? {};
  if (Number(links.danglingLegacyEvvLinks || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.danglingLegacyEvvLinks} Home Health visit(s) reference a missing legacy EVV visit`);
  if (Number(links.scopeMismatchLinks || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.scopeMismatchLinks} EVV/Home Health visit link(s) cross organization/patient scope`);
  if (Number(links.completedOrActiveVisitsMissingCanonicalEvv || 0) > 0) throw new Error(`[home-health-regulated-core] ${links.completedOrActiveVisitsMissingCanonicalEvv} EVV-required in-progress/completed Home Health visit(s) are not linked to the canonical SpireEvvVisit record`);

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
  console.log(`[home-health-regulated-core] PASS: regulated schema and canonical Home Health↔EVV link integrity are valid.`);
  console.log(`[home-health-regulated-core] OASIS spec registered: ${spec.specName} ${spec.itemSetVersionCode} / ${spec.submissionSpecVersion}; status=${spec.status}; items=${spec.itemDefinitionCount}; edits=${spec.editRuleCount}.`);
  if (spec.status === 'REGISTERED' || Number(spec.itemDefinitionCount) === 0 || Number(spec.editRuleCount) === 0) {
    console.warn('[home-health-regulated-core] OASIS submission remains intentionally blocked until the official CMS 3.02 item definitions/edit rules are loaded and validated.');
  }
  const warnings = operationalWarnings[0] ?? {};
  console.log(`[home-health-regulated-core] operational warnings: active episodes without certification period=${warnings.activeEpisodesWithoutCertificationPeriod ?? 0}; overdue POC signatures=${warnings.overduePocSignatures ?? 0}; overdue order signatures=${warnings.overdueOrderSignatures ?? 0}.`);
} finally {
  await prisma.$disconnect();
}
