import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const migrationNames = [
  '20260804064500_update_employee_application_role_check_for_doo',
  '20260806203500_employee_workflow_automation',
  '20260807125000_finalize_doo_job_opening',
  '20260807220000_spire_clinical_foundation',
  '20260807232000_spire_order_composer',
  '20260807233000_spire_emar_foundation',
  '20260807234500_spire_care_plan_isp',
  '20260807235000_spire_incident_management',
  '20260808001000_spire_assessments_flowsheets',
  '20260808002000_spire_scheduling_cadence',
  '20260808004000_spire_authorizations_evv',
  '20260808005000_spire_documents_external_records',
  '20260808006000_spire_communications_inbasket',
];
const prisma = new PrismaClient();

try {
  for (const migrationName of migrationNames) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "finished_at", "rolled_back_at"
         FROM "_prisma_migrations"
        WHERE "migration_name" = $1
        ORDER BY "started_at" DESC
        LIMIT 1`,
      migrationName,
    );

    const latest = rows[0];
    const isFailed = latest && !latest.finished_at && !latest.rolled_back_at;

    if (!isFailed) {
      console.log(`No failed migration state requires recovery for ${migrationName}.`);
      continue;
    }

    console.log(`Marking failed migration ${migrationName} as rolled back before retry.`);
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName],
      { stdio: 'inherit', env: process.env },
    );

    if (result.status !== 0) {
      throw new Error(`Unable to resolve failed migration ${migrationName}.`);
    }
  }
} finally {
  await prisma.$disconnect();
}
