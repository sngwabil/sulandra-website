# Sulandra 1.1 Release Readiness

Status: RELEASE CANDIDATE VALIDATION IN PROGRESS

## Candidate identity

- Development branch: `sulandra-1.1`
- Candidate source SHA at validation start: `aef76ed449b8b8df4642b0d576df119cf79f849d`
- Frozen Sulandra 1.0 rollback branch: `release/sulandra-1.0`
- Frozen Sulandra 1.0 rollback SHA: `454cc03d7dbca4aef0b8fb65de64b2eed5b9234d`
- Production promotion is intentionally NOT part of this validation PR.

## Roadmap completion represented by the candidate

The completed Sulandra 1.1 roadmap includes the merged controls for:

1. Sulandra 1.1 initialization / production freeze governance
2. Company Chronicles / white-label company configuration
3. Global Admin UI restructuring
4. Universal MFA for governed Admin / PHI / regulated roles
5. Disaster recovery and verified backup/restore controls
6. NMT workforce / dispatch qualification lockouts
7. Canonical immutable NMT EVV visit model
8. Immutable EVV correction history / effective-value overlay
9. Medicaid / DODD billing rule envelope
10. Pre-bill hard stops and stale-claim fingerprint checks
11. Payroll / time-attendance lockouts
12. Canonical Admin operations mapping

## Required validation gates

A production promotion must not occur unless all of the following are true:

- Full GitHub CI succeeds on the release-readiness PR.
- Disaster Recovery Verification succeeds on the release-readiness PR.
- Database migration regression succeeds.
- Static website build and public-output verification succeed.
- API / TypeScript / Prisma validation succeeds.
- Existing SPIRE production-invariant checks remain green.
- Railway production remains healthy during validation.
- `sulandra-1.1` / final release branch is protected from unreviewed direct writes before promotion.
- A frozen `release/sulandra-1.1` branch is created only after the final validation commit is known.
- Production deployment occurs only after explicit release approval.

## Known release blockers / external gates

These items are not satisfied merely by a green software build and must remain explicit:

1. **GitHub branch protection:** at validation start, `sulandra-1.1` is not protected. This is a release-governance blocker before production promotion.
2. **Ohio Alternate EVV external certification/testing:** software support must not be described as ODM/Sandata certified until external vendor/state testing and certification are completed.
3. **External claim / trading-partner workflows:** direct state/clearinghouse submission must not be claimed until real credentials, trading-partner rules, acknowledgements, and production handoff are verified.
4. **Production disaster-recovery target:** repository DR verification proves backup/restore mechanics, but actual production database PITR/backup ownership and restore procedure must be confirmed for the live database before declaring production DR complete.
5. **Railway source metadata consistency:** the primary Railway API/static project has previously reported the legacy `feature/spire-ehr-platform` source branch while its deployed commit remains the frozen Sulandra 1.0 SHA. Do not promote 1.1 until the intended release branch/source mapping is explicit and verified.

## Railway production freeze expectation during validation

During release-readiness work, production should remain on Sulandra 1.0. A healthy production deployment is not evidence that Sulandra 1.1 has been deployed.

Expected rollback authority:

- Branch: `release/sulandra-1.0`
- Commit: `454cc03d7dbca4aef0b8fb65de64b2eed5b9234d`

## Promotion sequence after validation

1. Merge the release-readiness PR only after CI and DR are green.
2. Freeze the resulting commit into `release/sulandra-1.1`.
3. Enable/enforce branch protection for the release branch and active 1.1 branch.
4. Verify Railway service source configuration and intended release branch mapping.
5. Run a non-production/canary validation using production-like variables and an isolated database before changing production traffic.
6. Verify `/health`, authentication/MFA, company context, Admin operations, Client Intake -> SPIRE promotion, NMT dispatch/qualification, EVV completion/corrections, billing/pre-bill, time-attendance/payroll, and key SPIRE 1.0 invariants.
7. Confirm rollback path to `release/sulandra-1.0` before promotion.
8. Promote production only after explicit approval.
9. Monitor deployment health, HTTP failures, CPU/memory, database migrations, authentication errors, and critical operational routes immediately after cutover.

## Release decision

This document is a gate checklist, not an automatic GO decision. A green CI/DR result establishes software validation for the candidate. Production GO additionally requires the governance, external certification/integration, Railway source, production DR, and canary conditions above to be satisfied or explicitly accepted as release exceptions.
