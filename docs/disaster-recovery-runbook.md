# Sulandra Health Disaster Recovery Runbook

## Purpose

This runbook defines the Sulandra 1.1 engineering controls for PostgreSQL backup, restore, validation, incident recovery, and evidence retention. It is designed to prevent an untested backup from being treated as a recovery capability.

Production remains frozen on `release/sulandra-1.0` while Sulandra 1.1 disaster-recovery controls are built and verified. This document does not authorize a production restore by itself.

## Recovery objectives

The following are Sulandra 1.1 engineering targets and must be formally approved before production release:

- **Primary RPO target:** 15 minutes when Railway PostgreSQL Point-in-Time Recovery is enabled and healthy.
- **Fallback RPO target:** 24 hours when only scheduled snapshot backup is available.
- **RTO target:** 4 hours from declared recovery event to validated service availability.
- **Automated restore-drill target:** 10 minutes for the CI disposable-database restore regression.

If production infrastructure cannot meet the primary RPO target, the release record must explicitly state the active fallback RPO and the remediation owner/date. No team member may describe a backup as compliant merely because a backup file exists.

## Production acceptance gate

Sulandra 1.1 is not production-ready for disaster recovery until all of the following are evidenced:

1. The actual production PostgreSQL service is identified and owned.
2. Railway backup configuration is inspected in the production environment.
3. Point-in-Time Recovery status and retention are recorded when PITR is used for the 15-minute RPO target.
4. At least one production-like restore drill completes successfully into a separate target database/service.
5. The restored database is validated for schema, critical tables, row-level sentinel evidence, and application health.
6. Measured recovery time is within the approved RTO, or a signed remediation plan exists.
7. A disaster-recovery tabletop is completed with participants, timeline, gaps, and corrective actions documented.
8. The evidence is retained with the release/change record.

Until this gate is satisfied, the code-level controls in this repository are considered recovery infrastructure, not proof of production recovery readiness.

## Backup strategy

### Railway PostgreSQL

Use Railway PostgreSQL backup/PITR controls for infrastructure-level recovery when available. Point-in-Time Recovery is preferred because it can restore to a timestamp between scheduled snapshots. A restore should create or target a separate recovery service/database first so the source remains available for investigation.

### Portable logical backup

The repository also provides `scripts/dr-create-postgres-backup.sh` as a portable logical-backup control. It creates a PostgreSQL custom-format dump with:

- ownership and privilege metadata excluded,
- a restore manifest,
- SHA-256 integrity evidence,
- start/finish timestamps and size metadata.

This portable backup is useful for restore drills, migration recovery, and independent validation. It is not a substitute for verifying Railway's production backup/PITR configuration.

## Restore controls

`scripts/dr-restore-postgres-backup.sh` is fail-closed by default.

- `DR_ALLOW_RESTORE=true` is required for any restore.
- A production-like target additionally requires `DR_ALLOW_PRODUCTION_RESTORE=true`.
- Routine drills must use a disposable/non-production target.
- Integrity verification runs before restore when the backup SHA-256 file is present.
- `pg_restore --exit-on-error` stops the operation on the first restore failure.

Never overwrite the only known-good production database as the first recovery action.

## Incident recovery sequence

1. **Declare the incident.** Record time, reporter, affected service, symptoms, and suspected data-loss window.
2. **Preserve evidence.** Do not destroy the source database, logs, deployment metadata, or failed migration evidence.
3. **Choose recovery point.** Select PITR timestamp or verified backup based on the incident timeline and approved RPO.
4. **Create isolated recovery target.** Restore into a separate PostgreSQL service/database wherever possible.
5. **Restore.** Use Railway restore tooling or the guarded repository restore script.
6. **Validate data.** Confirm required tables, expected migrations, critical row counts, representative client/employee/chart data, and audit evidence.
7. **Validate application.** Point a controlled test deployment at the restored database and verify `/health`, authentication, Admin, SPIRE, intake, and critical workflow smoke paths.
8. **Measure RTO.** Record start time, restore-complete time, application-validation time, and total recovery duration.
9. **Promote deliberately.** Update production database routing only after recovery validation and change approval.
10. **Close and learn.** Complete the tabletop/post-incident template, assign corrective actions, and retain evidence.

## Restore validation checklist

Minimum database validation:

- Prisma/migration state is consistent.
- `LegalEntity` exists.
- `SpirePatient` exists.
- `CompanyComplianceEvidence` exists.
- `RevenueCycleServiceEvent` exists.
- Audit/security tables required by the active release exist.
- Sentinel or known test record is present after the restore drill.
- No unexpected owner/privilege errors were introduced by the restore.

Minimum application validation:

- API process starts successfully.
- `/health` returns success.
- Employee login reaches the correct authentication flow.
- Admin workspace loads with the expected company context.
- SPIRE patient workspace loads.
- Client Intake to SPIRE admission regression remains green.

## Evidence to retain

For every formal drill or real recovery event retain:

- incident/drill identifier,
- source environment and database identifier,
- selected recovery timestamp or backup identifier,
- backup SHA-256 and metadata when a logical backup is used,
- start/end timestamps,
- measured RPO and RTO,
- validation results,
- participants,
- gaps identified,
- corrective actions with owner and due date,
- final approval/closure decision.

## CI restore drill

The dedicated disaster-recovery workflow provisions disposable PostgreSQL 16, builds the current schema, inserts a restore sentinel, creates a custom-format backup, restores it into a separate database, validates the sentinel and required tables, and fails if the drill exceeds 600 seconds.

This proves that the repository's logical backup and restore path remains executable. It does not prove that production Railway backup/PITR is enabled; that remains part of the production acceptance gate above.
