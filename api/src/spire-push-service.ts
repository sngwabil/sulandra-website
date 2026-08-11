import { createCipheriv, createDecipheriv, createPrivateKey, createHash, randomBytes, sign } from 'node:crypto';
import { connect as connectHttp2 } from 'node:http2';
import type { PrismaClient } from '@prisma/client';

type DeliveryRow = {
  id: string;
  organizationId: string;
  legalEntityId: string | null;
  userId: string;
  deviceId: string | null;
  category: string;
  title: string;
  body: string;
  deepLink: string | null;
  data: Record<string, unknown> | null;
  priority: string;
  attemptCount: number;
};

type DeviceRow = {
  id: string;
  platform: string;
  provider: string;
  tokenCiphertext: string | null;
  appBundleId: string | null;
  environment: string | null;
};

type ProviderResult = { ok: boolean; providerMessageId?: string; errorCode?: string; disableDevice?: boolean };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const pushEncryptionKey = () => {
  const configured = text(process.env.PUSH_TOKEN_ENCRYPTION_KEY);
  if (!configured) return null;
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(configured)) key = Buffer.from(configured, 'hex');
  else {
    try { key = Buffer.from(configured, 'base64'); }
    catch { return null; }
  }
  return key.length === 32 ? key : null;
};

export const pushTokenHash = hash;

export const encryptPushToken = (token: string) => {
  const key = pushEncryptionKey();
  if (!key) throw Object.assign(new Error('PUSH_TOKEN_ENCRYPTION_KEY must be configured as a 32-byte key before mobile push registration'), { status: 503 });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

const decryptPushToken = (value: string) => {
  const key = pushEncryptionKey();
  if (!key) throw new Error('push token encryption key is unavailable');
  const [version, ivValue, tagValue, ciphertextValue] = value.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) throw new Error('invalid encrypted push token');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const normalizedPrivateKey = (value: string) => value.replace(/\\n/g, '\n');

let cachedFcmToken: { token: string; expiresAt: number } | null = null;
async function fcmAccessToken() {
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) return cachedFcmToken.token;
  const clientEmail = text(process.env.FCM_CLIENT_EMAIL);
  const privateKeyValue = text(process.env.FCM_PRIVATE_KEY);
  if (!clientEmail || !privateKeyValue) throw new Error('FCM service account is not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), createPrivateKey(normalizedPrivateKey(privateKeyValue)));
  const assertion = `${unsigned}.${signature.toString('base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || `FCM OAuth failed with HTTP ${response.status}`);
  cachedFcmToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in || 3600)) * 1000,
  };
  return cachedFcmToken.token;
}

async function sendFcm(token: string, delivery: DeliveryRow): Promise<ProviderResult> {
  const projectId = text(process.env.FCM_PROJECT_ID);
  if (!projectId) return { ok: false, errorCode: 'FCM_NOT_CONFIGURED' };
  try {
    const accessToken = await fcmAccessToken();
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(delivery.data || {})) {
      if (value === null || value === undefined) continue;
      data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    if (delivery.deepLink) data.deepLink = delivery.deepLink;
    data.category = delivery.category;
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: delivery.title, body: delivery.body },
          data,
          android: { priority: delivery.priority === 'HIGH' ? 'HIGH' : 'NORMAL' },
        },
      }),
    });
    const payload = await response.json().catch(() => ({})) as { name?: string; error?: { status?: string; message?: string } };
    if (response.ok) return { ok: true, providerMessageId: payload.name || undefined };
    const code = payload.error?.status || `HTTP_${response.status}`;
    return {
      ok: false,
      errorCode: code,
      disableDevice: response.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT',
    };
  } catch (error) {
    return { ok: false, errorCode: `FCM_${error instanceof Error ? error.message : 'SEND_FAILED'}`.slice(0, 500) };
  }
}

let cachedApnsJwt: { token: string; expiresAt: number } | null = null;
function apnsProviderToken() {
  if (cachedApnsJwt && cachedApnsJwt.expiresAt > Date.now() + 60_000) return cachedApnsJwt.token;
  const teamId = text(process.env.APNS_TEAM_ID);
  const keyId = text(process.env.APNS_KEY_ID);
  const privateKeyValue = text(process.env.APNS_PRIVATE_KEY);
  if (!teamId || !keyId || !privateKeyValue) throw new Error('APNs signing credentials are not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(normalizedPrivateKey(privateKeyValue)),
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${unsigned}.${signature.toString('base64url')}`;
  cachedApnsJwt = { token, expiresAt: Date.now() + 50 * 60_000 };
  return token;
}

async function sendApns(token: string, device: DeviceRow, delivery: DeliveryRow): Promise<ProviderResult> {
  const bundleId = device.appBundleId || text(process.env.APNS_BUNDLE_ID);
  if (!bundleId) return { ok: false, errorCode: 'APNS_BUNDLE_ID_MISSING' };
  let authorization: string;
  try { authorization = apnsProviderToken(); }
  catch (error) { return { ok: false, errorCode: `APNS_${error instanceof Error ? error.message : 'NOT_CONFIGURED'}`.slice(0, 500) }; }
  const sandbox = String(device.environment || '').toUpperCase() === 'SANDBOX'
    || text(process.env.APNS_ENVIRONMENT).toLowerCase() === 'sandbox';
  const host = sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

  return new Promise((resolve) => {
    const client = connectHttp2(host);
    let resolved = false;
    let status = 0;
    let responseBody = '';
    const finish = (result: ProviderResult) => {
      if (resolved) return;
      resolved = true;
      try { client.close(); } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, errorCode: 'APNS_TIMEOUT' }), 10_000);
    client.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, errorCode: `APNS_${error.message}`.slice(0, 500) });
    });
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${authorization}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': delivery.priority === 'HIGH' ? '10' : '5',
      'content-type': 'application/json',
    });
    request.setEncoding('utf8');
    request.on('response', (headers) => { status = Number(headers[':status'] || 0); });
    request.on('data', (chunk) => { responseBody += chunk; });
    request.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, errorCode: `APNS_${error.message}`.slice(0, 500) });
    });
    request.on('end', () => {
      clearTimeout(timer);
      if (status >= 200 && status < 300) {
        finish({ ok: true });
        return;
      }
      let reason = `HTTP_${status}`;
      try { reason = (JSON.parse(responseBody) as { reason?: string }).reason || reason; } catch {}
      finish({
        ok: false,
        errorCode: reason,
        disableDevice: status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason),
      });
    });
    const payload = {
      aps: {
        alert: { title: delivery.title, body: delivery.body },
        sound: 'default',
        'thread-id': delivery.category,
      },
      category: delivery.category,
      deepLink: delivery.deepLink || undefined,
      data: delivery.data || {},
    };
    request.end(JSON.stringify(payload));
  });
}

async function processQueue(prisma: PrismaClient) {
  const deliveries = await prisma.$queryRawUnsafe<DeliveryRow[]>(
    `UPDATE "SpirePushDelivery" delivery
        SET "status"='PROCESSING',"attemptCount"="attemptCount"+1
      WHERE delivery."id" IN (
        SELECT queued."id"
          FROM "SpirePushDelivery" queued
         WHERE queued."status" IN ('QUEUED','RETRY')
           AND queued."nextAttemptAt"<=NOW()
         ORDER BY CASE queued."priority" WHEN 'HIGH' THEN 0 ELSE 1 END,queued."createdAt"
         FOR UPDATE SKIP LOCKED
         LIMIT 20
      )
      RETURNING delivery.*`,
  );

  for (const delivery of deliveries) {
    if (!delivery.deviceId) {
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDelivery" SET "status"='FAILED',"errorCode"='DEVICE_NOT_SET' WHERE "id"=$1`,
        delivery.id,
      );
      continue;
    }
    const devices = await prisma.$queryRawUnsafe<DeviceRow[]>(
      `SELECT "id","platform","provider","tokenCiphertext","appBundleId","environment"
         FROM "SpirePushDevice"
        WHERE "organizationId"=$1 AND "id"=$2 AND "status"='ACTIVE' LIMIT 1`,
      delivery.organizationId,
      delivery.deviceId,
    );
    const device = devices[0];
    if (!device?.tokenCiphertext) {
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDelivery" SET "status"='FAILED',"errorCode"='DEVICE_TOKEN_UNAVAILABLE' WHERE "id"=$1`,
        delivery.id,
      );
      continue;
    }

    let token: string;
    try { token = decryptPushToken(device.tokenCiphertext); }
    catch {
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDelivery" SET "status"='FAILED',"errorCode"='DEVICE_TOKEN_DECRYPT_FAILED' WHERE "id"=$1`,
        delivery.id,
      );
      continue;
    }

    const result = device.provider === 'APNS'
      ? await sendApns(token, device, delivery)
      : await sendFcm(token, delivery);

    if (result.ok) {
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDelivery" SET "status"='SENT',"providerMessageId"=$1,"errorCode"=NULL,"sentAt"=NOW() WHERE "id"=$2`,
        result.providerMessageId || null,
        delivery.id,
      );
      continue;
    }

    if (result.disableDevice) {
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDevice" SET "status"='INACTIVE',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`,
        delivery.organizationId,
        device.id,
      );
    }
    const attempts = Number(delivery.attemptCount || 0) + 1;
    const terminal = result.disableDevice || attempts >= 5;
    const retrySeconds = Math.min(900, Math.max(30, 30 * (2 ** Math.max(0, attempts - 1))));
    await prisma.$executeRawUnsafe(
      `UPDATE "SpirePushDelivery"
          SET "status"=$1,"errorCode"=$2,"nextAttemptAt"=NOW()+($3||' seconds')::interval
        WHERE "id"=$4`,
      terminal ? 'FAILED' : 'RETRY',
      (result.errorCode || 'SEND_FAILED').slice(0, 500),
      String(retrySeconds),
      delivery.id,
    );
  }
}

let dispatcherStarted = false;
export const startSpirePushDispatcher = (prisma: PrismaClient) => {
  if (dispatcherStarted) return;
  dispatcherStarted = true;
  const timer = setInterval(() => {
    void processQueue(prisma).catch((error) => {
      console.warn('[spire-push] queue processing failed', error);
    });
  }, 10_000);
  timer.unref();
  console.log('SPIRE field push dispatcher started for APNs/FCM queued notifications.');
};
