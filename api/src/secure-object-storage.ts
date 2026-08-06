import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import net from 'node:net';

export type StoredObject = {
  bucket: string;
  key: string;
  sizeBytes: number;
  sha256: string;
  etag: string | null;
  encryption: 'SSE-KMS' | 'SSE-S3' | 'CLIENT-AES-256-GCM';
  kmsKeyId: string | null;
  ivBase64: string | null;
  authTagBase64: string | null;
};

export type MalwareScanResult = {
  status: 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';
  engine: string;
  signature: string | null;
  detail: string;
};

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256Hex = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();

function storageConfig() {
  const endpoint = String(process.env.EMPLOYEE_OBJECT_STORAGE_ENDPOINT || '').replace(/\/$/, '');
  const region = process.env.EMPLOYEE_OBJECT_STORAGE_REGION || 'us-east-1';
  const bucket = process.env.EMPLOYEE_OBJECT_STORAGE_BUCKET || '';
  const accessKeyId = process.env.EMPLOYEE_OBJECT_STORAGE_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.EMPLOYEE_OBJECT_STORAGE_SECRET_ACCESS_KEY || '';
  const forcePathStyle = process.env.EMPLOYEE_OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw Object.assign(new Error('Secure employee object storage is not configured'), { status: 503 });
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle };
}

function objectUrl(config: ReturnType<typeof storageConfig>, key: string) {
  const encodedKey = key.split('/').map(encode).join('/');
  if (config.forcePathStyle) return `${config.endpoint}/${encode(config.bucket)}/${encodedKey}`;
  const url = new URL(config.endpoint);
  return `${url.protocol}//${encode(config.bucket)}.${url.host}/${encodedKey}`;
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signHeaders(method: string, urlText: string, body: Buffer, headers: Record<string, string>, config: ReturnType<typeof storageConfig>) {
  const url = new URL(urlText);
  const now = new Date();
  const timestamp = amzDate(now);
  const dateStamp = timestamp.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const normalizedHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': timestamp,
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')])),
  };
  const sortedNames = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = sortedNames.map(name => `${name}:${normalizedHeaders[name]}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    ...normalizedHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export async function scanBufferForMalware(buffer: Buffer): Promise<MalwareScanResult> {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host) return { status: 'UNAVAILABLE', engine: 'clamav', signature: null, detail: 'CLAMAV_HOST is not configured' };
  return await new Promise<MalwareScanResult>((resolve) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ status: 'UNAVAILABLE', engine: 'clamav', signature: null, detail: 'Malware scan timed out' });
    }, Number(process.env.CLAMAV_TIMEOUT_MS || 15000));
    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      const length = Buffer.alloc(4);
      length.writeUInt32BE(buffer.length, 0);
      socket.write(length);
      socket.write(buffer);
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
    socket.on('error', error => {
      clearTimeout(timer);
      resolve({ status: 'UNAVAILABLE', engine: 'clamav', signature: null, detail: error.message });
    });
    socket.on('close', () => {
      clearTimeout(timer);
      const response = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (/FOUND$/i.test(response)) {
        const signature = response.replace(/^.*?:\s*/, '').replace(/\s+FOUND$/i, '') || 'unknown';
        resolve({ status: 'INFECTED', engine: 'clamav', signature, detail: response });
      } else if (/OK$/i.test(response)) {
        resolve({ status: 'CLEAN', engine: 'clamav', signature: null, detail: response });
      } else {
        resolve({ status: 'UNAVAILABLE', engine: 'clamav', signature: null, detail: response || 'No scan response' });
      }
    });
  });
}

function optionalClientEncrypt(buffer: Buffer) {
  const keyBase64 = process.env.EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64;
  if (!keyBase64) return { body: buffer, encryption: null as null | { ivBase64: string; authTagBase64: string } };
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64 must decode to 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { body: encrypted, encryption: { ivBase64: iv.toString('base64'), authTagBase64: cipher.getAuthTag().toString('base64') } };
}

export function decryptClientEncryptedObject(buffer: Buffer, ivBase64: string, authTagBase64: string) {
  const keyBase64 = process.env.EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64;
  if (!keyBase64) throw new Error('Client-side object encryption key is unavailable');
  const key = Buffer.from(keyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

export async function putSecureObject(input: { key: string; body: Buffer; contentType: string; metadata?: Record<string, string> }): Promise<StoredObject> {
  const config = storageConfig();
  const originalSha = sha256Hex(input.body);
  const encrypted = optionalClientEncrypt(input.body);
  const kmsKeyId = process.env.EMPLOYEE_OBJECT_STORAGE_KMS_KEY_ID || null;
  const headers: Record<string, string> = {
    'content-type': input.contentType || 'application/octet-stream',
    'x-amz-meta-original-sha256': originalSha,
    'x-amz-meta-original-size': String(input.body.length),
    ...Object.fromEntries(Object.entries(input.metadata || {}).map(([k, v]) => [`x-amz-meta-${k.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`, v])),
  };
  let encryption: StoredObject['encryption'];
  if (encrypted.encryption) {
    encryption = 'CLIENT-AES-256-GCM';
    headers['x-amz-server-side-encryption'] = kmsKeyId ? 'aws:kms' : 'AES256';
  } else if (kmsKeyId) {
    encryption = 'SSE-KMS';
    headers['x-amz-server-side-encryption'] = 'aws:kms';
    headers['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKeyId;
  } else {
    encryption = 'SSE-S3';
    headers['x-amz-server-side-encryption'] = 'AES256';
  }
  const url = objectUrl(config, input.key);
  const signed = signHeaders('PUT', url, encrypted.body, headers, config);
  const response = await fetch(url, { method: 'PUT', headers: signed, body: encrypted.body });
  if (!response.ok) throw Object.assign(new Error(`Object storage upload failed (${response.status})`), { status: 502 });
  return {
    bucket: config.bucket,
    key: input.key,
    sizeBytes: input.body.length,
    sha256: originalSha,
    etag: response.headers.get('etag'),
    encryption,
    kmsKeyId,
    ivBase64: encrypted.encryption?.ivBase64 || null,
    authTagBase64: encrypted.encryption?.authTagBase64 || null,
  };
}

export async function getSecureObject(key: string): Promise<Buffer> {
  const config = storageConfig();
  const url = objectUrl(config, key);
  const signed = signHeaders('GET', url, Buffer.alloc(0), {}, config);
  const response = await fetch(url, { headers: signed });
  if (response.status === 404) throw Object.assign(new Error('Stored object was not found'), { status: 404 });
  if (!response.ok) throw Object.assign(new Error(`Object storage download failed (${response.status})`), { status: 502 });
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteSecureObject(key: string): Promise<void> {
  const config = storageConfig();
  const url = objectUrl(config, key);
  const signed = signHeaders('DELETE', url, Buffer.alloc(0), {}, config);
  const response = await fetch(url, { method: 'DELETE', headers: signed });
  if (!response.ok && response.status !== 404) throw Object.assign(new Error(`Object storage deletion failed (${response.status})`), { status: 502 });
}
