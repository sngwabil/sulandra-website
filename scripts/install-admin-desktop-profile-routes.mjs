import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../api/src/onboarding-bootstrap.ts', import.meta.url);
let source = await readFile(target, 'utf8');
const marker = '// ADMIN_DESKTOP_PROFILE_ROUTES_V1';

if (!source.includes(marker)) {
  const anchor = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
  if (!source.includes(anchor)) throw new Error('Careers route registration anchor was not found.');

  const routes = String.raw`
${marker}
const desktopProfileInputSchema = z.object({
  profile: z.record(z.string(), z.unknown()).default({}),
  wallpapers: z.record(z.enum(['community', 'homehealth', 'nemt']), z.string().max(12_000_000)).default({}),
});

const desktopProfileRoles = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
];

app.get(
  '/api/admin/desktop-profile',
  requireRoles(...desktopProfileRoles),
  async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<Array<{
        profile: Record<string, unknown> | null;
        wallpapers: Record<string, string> | null;
        updatedAt: Date | string;
      }>>(
        `SELECT "profile", "wallpapers", "updatedAt"
         FROM "AdminDesktopProfile"
         WHERE "userId" = $1 AND "organizationId" = $2
         LIMIT 1`,
        auth.userId,
        auth.organizationId,
      );
      const row = rows[0];
      res.json({
        data: {
          profile: row?.profile ?? {},
          wallpapers: row?.wallpapers ?? {},
          updatedAt: row?.updatedAt ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.put(
  '/api/admin/desktop-profile',
  requireRoles(...desktopProfileRoles),
  async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = desktopProfileInputSchema.parse(req.body ?? {});
      const profileJson = JSON.stringify(input.profile);
      const wallpapersJson = JSON.stringify(input.wallpapers);
      const totalBytes = Buffer.byteLength(profileJson) + Buffer.byteLength(wallpapersJson);
      if (totalBytes > 18 * 1024 * 1024) {
        res.status(413).json({ error: 'Desktop profile and wallpaper data must be smaller than 18 MB.' });
        return;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AdminDesktopProfile"
           ("userId", "organizationId", "profile", "wallpapers", "createdAt", "updatedAt")
         VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW(), NOW())
         ON CONFLICT ("userId") DO UPDATE SET
           "organizationId" = EXCLUDED."organizationId",
           "profile" = EXCLUDED."profile",
           "wallpapers" = EXCLUDED."wallpapers",
           "updatedAt" = NOW()`,
        auth.userId,
        auth.organizationId,
        profileJson,
        wallpapersJson,
      );
      await audit(auth, 'UPDATE_ADMIN_DESKTOP_PROFILE', 'AdminDesktopProfile', auth.userId, {
        wallpaperServices: Object.keys(input.wallpapers),
      });
      res.json({ data: { saved: true, updatedAt: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  },
);

`;

  source = source.replace(anchor, routes + anchor);
  await writeFile(target, source);
  console.log('Installed authenticated admin desktop profile routes.');
} else {
  console.log('Admin desktop profile routes are already installed.');
}
