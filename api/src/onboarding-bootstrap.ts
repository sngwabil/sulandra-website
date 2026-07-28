import express from 'express';
import cors from 'cors';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { registerCareersRoutes } from '../../spire/api/src/careers-routes.js';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'spire-api', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/public/') || req.path === '/health') return next();

  const authorization = req.header('authorization');
  const internalKey = req.header('x-sulandra-api-key');
  const configuredKey = process.env.SULANDRA_INTERNAL_API_KEY;

  if (!authorization && !(configuredKey && internalKey === configuredKey)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const organizationId = req.header('x-organization-id') || process.env.CAREERS_ORGANIZATION_ID;
  if (!organizationId) {
    return res.status(503).json({ error: 'CAREERS_ORGANIZATION_ID is not configured' });
  }

  res.locals.auth = {
    userId: req.header('x-user-id') || process.env.PRIMARY_ADMIN_USER_ID || 'sulandra-administrator',
    organizationId,
    role: (req.header('x-user-role') || UserRole.ADMINISTRATOR) as UserRole,
  };
  next();
});

const authOf = (response: express.Response) => response.locals.auth as {
  userId: string;
  organizationId: string;
  role: UserRole;
};

const requireRoles = (...roles: UserRole[]): express.RequestHandler => (_req, res, next) => {
  const auth = authOf(res);
  if (!auth || !roles.includes(auth.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

const audit = async (
  auth: Partial<{ userId: string; organizationId: string; role: UserRole }>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuditEvent" ("id","organizationId","userId","action","resourceType","resourceId","metadata","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())`,
      randomUUID(),
      auth.organizationId ?? null,
      auth.userId ?? null,
      action,
      resourceType,
      resourceId ?? null,
      JSON.stringify(metadata ?? {}),
    );
  } catch (error) {
    console.warn('[audit] event could not be persisted', { action, resourceType, error });
  }
};

registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[spire-api]', error);
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ error: message });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`SPIRE API listening on 0.0.0.0:${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
