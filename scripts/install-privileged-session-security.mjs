import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/onboarding-bootstrap.ts');
let source=await readFile(target,'utf8');
const anchor='\ntype AuditColumn = {';
const marker="app.post('/api/auth/privileged/reauthenticate'";

if(!source.includes(marker)){
  if(!source.includes(anchor))throw new Error('Privileged session security anchor is missing');
  const block=`const privilegedReauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many password verification attempts. Please try again later.' },
});

app.post('/api/auth/privileged/reauthenticate', privilegedReauthLimiter, async (req, res, next) => {
  try {
    const auth = authOf(res);
    const privilegedRoles = new Set(['ADMINISTRATOR', 'CEO', 'DOO']);
    if (!privilegedRoles.has(String(auth.role))) {
      res.status(403).json({ error: 'Privileged administrator verification is not available for this account' });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 1_024) {
      res.status(400).json({ error: 'Admin password is required' });
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null; passwordHash: string | null }>>(\
      \`SELECT u."email", c."passwordHash"\
       FROM "User" u\
       LEFT JOIN "EmployeePortalCredential" c ON c."userId" = u."id"\
       WHERE u."organizationId"=$1 AND u."id"=$2\
       LIMIT 1\`,\
      auth.organizationId,\
      auth.userId,\
    );
    const row = rows[0];
    const email = row?.email?.trim().toLowerCase() || auth.email?.trim().toLowerCase() || '';
    const ownerPasswordValid = email === administratorEmail
      && secureEquals(password, process.env.ADMIN_INITIAL_PASSWORD);
    const portalPasswordValid = verifyPortalPassword(password, row?.passwordHash || null);
    if (!ownerPasswordValid && !portalPasswordValid) {
      await recordLoginEvent(prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        identifier: email || auth.userId,
        decision: 'DENY',
        reason: 'Privileged step-up password verification failed',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
        sessionId: (auth as AuthContext & { sessionId?: string }).sessionId,
      });
      res.status(401).json({ error: 'The Admin password is incorrect' });
      return;
    }

    await recordLoginEvent(prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      identifier: email || auth.userId,
      decision: 'ALLOW',
      reason: 'Privileged step-up password verification',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      sessionId: (auth as AuthContext & { sessionId?: string }).sessionId,
    });
    res.json({ data: { verified: true, reauthenticatedAt: new Date().toISOString(), validForSeconds: 300 } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (_req, res, next) => {
  try {
    const auth = authOf(res);
    const sessionId = String((auth as AuthContext & { sessionId?: string }).sessionId || '');
    if (sessionId) {
      await prisma.$executeRawUnsafe(
        \`UPDATE "EmployeeAuthSession"\
         SET "revokedAt"=COALESCE("revokedAt",NOW()),\
             "revokedById"=COALESCE("revokedById",$1),\
             "revocationReason"=COALESCE("revocationReason",'User signed out')\
         WHERE "id"=$2 AND "organizationId"=$3 AND "userId"=$4\`,
        auth.userId,
        sessionId,
        auth.organizationId,
        auth.userId,
      ).catch(() => undefined);
    }
    res.json({ data: { signedOut: true } });
  } catch (error) {
    next(error);
  }
});`;
  source=source.replace(anchor,`\n${block}\n\ntype AuditColumn = {`);
}

if(!source.includes("app.post('/api/auth/logout'"))throw new Error('Privileged session logout route was not installed');
await writeFile(target,source,'utf8');
console.log('Privileged Admin session security installed: password step-up and server-side session revocation on sign-out.');
