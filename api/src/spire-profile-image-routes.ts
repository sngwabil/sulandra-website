import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type Dependencies = {
  authOf: (response: express.Response) => AuthContext;
};

type ProfileImageRow = {
  id: string;
  kind: 'CLIENT' | 'PCP';
  providerName: string | null;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  updatedAt: Date | string;
};

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);

const writerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);

const adminEmails = new Set(['admin@sulandrahealth.com', 'doo@sulandrahealth.com']);
const maxProfileImageBytes = 2 * 1024 * 1024;

const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isAdmin = (auth: AuthContext) =>
  [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO].includes(auth.role)
  || adminEmails.has(String(auth.email || '').trim().toLowerCase());

const allowed = async (prisma: PrismaClient, auth: AuthContext, patientId: string) => {
  if (isAdmin(auth) || auth.role === UserRole.AUDITOR) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment"
       WHERE "organizationId"=$1 AND "userId"=$2 AND "clientId"=$3
       UNION ALL
       SELECT 1
       FROM "SpirePatientHomeAssignment" q
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=q."organizationId" AND h."homeId"=q."homeId"
       WHERE q."organizationId"=$1 AND h."userId"=$2 AND q."patientId"=$3
         AND (q."endsAt" IS NULL OR q."endsAt">NOW())
     ) AS ok`,
    auth.organizationId,
    auth.userId,
    patientId,
  );
  return rows[0]?.ok === true;
};

const requireScope = async (
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  write = false,
) => {
  if (!clinicalRoles.has(auth.role) || (write && !writerRoles.has(auth.role) && !isAdmin(auth))) {
    throw Object.assign(new Error(write ? 'Clinical profile photo update permission is required' : 'Clinical chart permission is required'), { status: 403 });
  }
  if (!(await allowed(prisma, auth, patientId))) {
    throw Object.assign(new Error('This chart is outside your authorized clinical scope'), { status: 403 });
  }

  // The live SPIRE workspace uses the canonical SpirePatient UUID as patientId.
  // SpireClientProfile is a legacy clinical-profile projection whose clientId can
  // differ from that UUID, so it must not be used to decide whether a live chart
  // exists. Match the same canonical identity source used by the foundation chart
  // routes so profile-photo reads/writes resolve the chart that is already open.
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpirePatient"
       WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE
     ) AS exists`,
    auth.organizationId,
    patientId,
  );
  if (rows[0]?.exists !== true) {
    throw Object.assign(new Error('Patient chart was not found'), { status: 404 });
  }
};

const kindOf = (value: string): 'CLIENT' | 'PCP' => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CLIENT' || normalized === 'PCP') return normalized;
  throw Object.assign(new Error('Profile image kind must be client or pcp'), { status: 400 });
};

const decodeImage = (dataBase64: unknown, requestedMime: unknown) => {
  const raw = text(dataBase64, 4_000_000);
  if (!raw) throw Object.assign(new Error('Profile image data is required'), { status: 400 });
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  const mimeType = match?.[1]?.toLowerCase() || text(requestedMime, 80).toLowerCase();
  const encoded = match?.[2] || raw;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw Object.assign(new Error('Profile images must be JPG, PNG, or WebP'), { status: 415 });
  }
  const body = Buffer.from(encoded.replace(/\s+/g, ''), 'base64');
  if (!body.length) throw Object.assign(new Error('Profile image is empty'), { status: 400 });
  if (body.length > maxProfileImageBytes) {
    throw Object.assign(new Error('Profile image must be 2 MB or smaller after processing'), { status: 413 });
  }
  const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  const png = body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const webp = body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
  const valid = mimeType === 'image/jpeg' ? jpeg : mimeType === 'image/png' ? png : webp;
  if (!valid) throw Object.assign(new Error('Profile image content does not match its file type'), { status: 415 });
  return {
    body,
    mimeType,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
};

const audit = async (
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  kind: 'CLIENT' | 'PCP',
  metadata: Record<string, unknown>,
) => {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"
       ("id","organizationId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent","createdAt")
     VALUES($1,$2,$3,$4,$5,'UPDATE_PROFILE_IMAGE','CHART_PROFILE_IMAGE',$6,$7::jsonb,$8,$9,NOW())`,
    randomUUID(),
    auth.organizationId,
    auth.userId,
    auth.email ?? null,
    patientId,
    `${patientId}:${kind}`,
    JSON.stringify(metadata),
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  );
};

const metadataOf = (row: ProfileImageRow | undefined) => row ? {
  kind: row.kind === 'CLIENT' ? 'client' : 'pcp',
  providerName: row.providerName,
  mimeType: row.mimeType,
  sha256: row.sha256,
  sizeBytes: Number(row.sizeBytes),
  updatedAt: row.updatedAt,
} : null;

export const registerSpireProfileImageRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: Dependencies,
) => {
  const { authOf } = dependencies;

  app.get('/api/spire/patients/:patientId/profile-images', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requireScope(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<ProfileImageRow[]>(
        `SELECT "id","kind","providerName","mimeType","sha256","sizeBytes","updatedAt"
         FROM "SpireChartProfileImage"
         WHERE "organizationId"=$1 AND "patientId"=$2`,
        auth.organizationId,
        patientId,
      );
      res.json({
        data: {
          client: metadataOf(rows.find((row) => row.kind === 'CLIENT')),
          pcp: metadataOf(rows.find((row) => row.kind === 'PCP')),
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/patients/:patientId/profile-images/:kind/content', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      const kind = kindOf(req.params.kind);
      await requireScope(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<ProfileImageRow & { imageData: Uint8Array | Buffer }>>(
        `SELECT "id","kind","providerName","mimeType","imageData","sha256","sizeBytes","updatedAt"
         FROM "SpireChartProfileImage"
         WHERE "organizationId"=$1 AND "patientId"=$2 AND "kind"=$3
         LIMIT 1`,
        auth.organizationId,
        patientId,
        kind,
      );
      const image = rows[0];
      if (!image) throw Object.assign(new Error('Profile image was not found'), { status: 404 });

      // Prisma Bytes values are Uint8Array in current Prisma clients. Express does
      // not guarantee raw-binary semantics for a generic Uint8Array, so normalize
      // the database value to a Node Buffer before sending it. Without this step,
      // the endpoint can carry an image/* content type while the body is serialized
      // data, which Safari/Chrome correctly show as a broken image.
      const imageBytes = Buffer.isBuffer(image.imageData)
        ? image.imageData
        : Buffer.from(image.imageData);
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Length', String(imageBytes.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('ETag', `"${image.sha256}"`);
      res.send(imageBytes);
    } catch (error) { next(error); }
  });

  app.put('/api/spire/patients/:patientId/profile-images/:kind', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      const kind = kindOf(req.params.kind);
      await requireScope(prisma, auth, patientId, true);
      const providerName = kind === 'PCP' ? text(req.body?.providerName, 250) : '';
      if (kind === 'PCP' && !providerName) {
        throw Object.assign(new Error('The PCP name must be loaded before saving the PCP photo'), { status: 400 });
      }
      const image = decodeImage(req.body?.dataBase64 ?? req.body?.dataUrl, req.body?.mimeType);
      const id = randomUUID();
      const rows = await prisma.$queryRawUnsafe<ProfileImageRow[]>(
        `INSERT INTO "SpireChartProfileImage"
           ("id","organizationId","patientId","kind","providerName","mimeType","imageData","sha256","sizeBytes","updatedByUserId","createdAt","updatedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         ON CONFLICT ("organizationId","patientId","kind") DO UPDATE SET
           "providerName"=EXCLUDED."providerName",
           "mimeType"=EXCLUDED."mimeType",
           "imageData"=EXCLUDED."imageData",
           "sha256"=EXCLUDED."sha256",
           "sizeBytes"=EXCLUDED."sizeBytes",
           "updatedByUserId"=EXCLUDED."updatedByUserId",
           "updatedAt"=NOW()
         RETURNING "id","kind","providerName","mimeType","sha256","sizeBytes","updatedAt"`,
        id,
        auth.organizationId,
        patientId,
        kind,
        providerName || null,
        image.mimeType,
        image.body,
        image.sha256,
        image.body.length,
        auth.userId,
      );
      const saved = rows[0];
      await audit(prisma, auth, patientId, kind, {
        kind,
        providerName: providerName || null,
        mimeType: image.mimeType,
        sha256: image.sha256,
        sizeBytes: image.body.length,
      });
      res.json({ data: metadataOf(saved) });
    } catch (error) { next(error); }
  });
};
