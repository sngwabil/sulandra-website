# Railway database migration

Railway PostgreSQL is the migration destination for Sulandra.

## Cutover policy

- Existing production records remain on Supabase until the historical copy and reconciliation are complete.
- New Codebase/IDE canary work uses the persistent Railway PostgreSQL database first.
- Prisma migrations are applied to Railway through the guarded predeploy path before the Railway-backed API starts.
- Production DATABASE_URL is not switched until row-count, referential-integrity, audit-ledger, authentication, and clinical-data reconciliation pass.
- Supabase remains rollback/read source during migration and is retired only after final cutover verification and backup retention are complete.
