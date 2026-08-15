// ONE-TIME RAILWAY CONNECTION-RECOVERY BOOT.
// This deliberately avoids opening PostgreSQL during predeploy so Railway can
// replace legacy API containers whose oversized Prisma pools exhausted all
// normal connection slots. The API build installs a bounded runtime Prisma pool.
// Restore railway.json to scripts/run-db-predeploy.mjs and /health immediately
// after both backend services have promoted this recovery deployment.
console.log('[db:recovery] deferring migrations for one deployment so bounded-pool API containers can replace connection-saturating legacy containers.');
