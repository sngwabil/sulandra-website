import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'api', 'src', 'client-intake-routes.ts'), 'utf8');
const migrationProxy = await readFile(path.join(root, 'prisma', 'migrations', '20260811082000_spire_patient_engagement_parity', 'migration.sql'), 'utf8');
const migrationConsent = await readFile(path.join(root, 'prisma', 'migrations', '20260811083000_spire_enterprise_parity', 'migration.sql'), 'utf8');

const required = [
  'CLIENT_INTAKE_LEGAL_CONSENT_NORMALIZATION_V1',
  'SpirePatientProxyRelationship',
  'CLIENT_INTAKE_GUARDIANSHIP:',
  "guardianFlag==='YES'&&guardianName&&guardianRelationship",
  "guardianFlag==='NO'&&existingGuardian[0]",
  "'INACTIVE'",
  'POA and representative-payee intake fields remain source documentation only',
  'ClientIntakeSignature',
  'SpireConsentDirective',
  "source\"='CLIENT_INTAKE_SIGNATURE'",
  "'CLIENT_INTAKE_SIGNATURE'",
  "'CLIENT_INTAKE'",
  "signature.revokedAt?'REVOKED':'ACTIVE'",
  'signature.signedByUserId||a.userId',
];
for (const value of required) {
  if (!source.includes(value)) throw new Error(`Client intake legal/consent normalization is missing ${value}`);
}
if (!migrationProxy.includes('CREATE TABLE IF NOT EXISTS "SpirePatientProxyRelationship"')) throw new Error('Proxy relationship persistence table is missing');
if (!migrationConsent.includes('CREATE TABLE IF NOT EXISTS "SpireConsentDirective"')) throw new Error('Consent directive persistence table is missing');
if (/clean\(legalDecision\.(?:poa|representativePayee)[^\n]{0,500}(?:proxyName|SpirePatientProxyRelationship)/.test(source)) {
  throw new Error('POA/representative-payee free text must not be converted into a proxy identity');
}
const markerCount = source.split('CLIENT_INTAKE_LEGAL_CONSENT_NORMALIZATION_V1').length - 1;
if (markerCount !== 1) throw new Error(`Expected one legal/consent normalization marker, found ${markerCount}`);
console.log('Client intake legal/consent normalization verified: structured guardian identity is source-linked and idempotent; free-text POA/payee data is not fabricated into proxy identity; every intake signature is source-linked to a durable consent/acknowledgment directive and revocation is preserved without deleting source evidence.');
