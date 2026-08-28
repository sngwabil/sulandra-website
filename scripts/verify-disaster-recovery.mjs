import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = {
  backup: await readFile(path.join(root, 'scripts', 'dr-create-postgres-backup.sh'), 'utf8'),
  restore: await readFile(path.join(root, 'scripts', 'dr-restore-postgres-backup.sh'), 'utf8'),
  runbook: await readFile(path.join(root, 'docs', 'disaster-recovery-runbook.md'), 'utf8'),
  tabletop: await readFile(path.join(root, 'docs', 'disaster-recovery-tabletop-template.md'), 'utf8'),
  workflow: await readFile(path.join(root, '.github', 'workflows', 'disaster-recovery.yml'), 'utf8'),
};

const failures = [];
const requireMarkers = (source, markers, label) => {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${label} missing: ${marker}`);
  }
};

requireMarkers(files.backup, [
  'pg_dump',
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  'sha256sum',
  '.manifest',
  '.metadata.json',
], 'backup script');

requireMarkers(files.restore, [
  'DR_ALLOW_RESTORE',
  'DR_ALLOW_PRODUCTION_RESTORE',
  'sha256sum --check',
  'pg_restore',
  '--exit-on-error',
], 'restore script');

requireMarkers(files.runbook, [
  'RPO',
  'RTO',
  '15 minutes',
  '24 hours',
  '4 hours',
  'Point-in-Time Recovery',
  'restore drill',
  'production acceptance gate',
  'release/sulandra-1.0',
], 'DR runbook');

requireMarkers(files.tabletop, [
  'Participants',
  'Timeline',
  'Gaps identified',
  'Corrective actions',
  'Owner',
  'Due date',
], 'tabletop template');

requireMarkers(files.workflow, [
  'name: Disaster Recovery Verification',
  'postgres:16',
  'dr-create-postgres-backup.sh',
  'dr-restore-postgres-backup.sh',
  'DR_TEST_RTO_SECONDS: 600',
  'Verify restored sentinel',
  'Verify restore drill RTO',
  'release/sulandra-1.0',
], 'DR workflow');

if (failures.length) {
  console.error('Disaster recovery verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Disaster recovery controls verified: guarded backup/restore tooling, documented RPO/RTO targets, restore-drill CI, and tabletop evidence template are present.');
