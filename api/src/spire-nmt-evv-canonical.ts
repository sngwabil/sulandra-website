import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

type SqlClient = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

type NmtCompletionEvidence = {
  providerMedicaidId: string;
  patientOtherId?: string | null;
  patientMedicaidId: string;
  payer: string;
  payerProgram: string;
  procedureCode: string;
  driverSignature: string;
  driverSignatureMethod?: 'DRAWN' | 'TYPED' | 'ELECTRONIC' | 'PIN';
  otherPersonsPresent?: string[];
  timeZone?: string;
};

type CreateInput = {
  organizationId: string;
  legalEntityId: string;
  tripId: string;
  actorUserId: string;
  evidence: NmtCompletionEvidence;
};

type TripSnapshot = Record<string, unknown> & {
  id: string;
  orderId: string;
  patientId: string | null;
  legType: string;
  driverUserId: string | null;
  driverProfileId: string | null;
  vehicleId: string | null;
  scheduledPickupAt: Date | string | null;
  scheduledDropoffAt: Date | string | null;
  arrivedPickupAt: Date | string | null;
  riderOnBoardAt: Date | string | null;
  departedPickupAt: Date | string | null;
  arrivedDropoffAt: Date | string | null;
  completedAt: Date | string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  milesDriven: number | null;
  pickupName: string | null;
  pickupStreet: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupPostalCode: string | null;
  dropoffName: string | null;
  dropoffStreet: string | null;
  dropoffCity: string | null;
  dropoffState: string | null;
  dropoffPostalCode: string | null;
  driverName: string | null;
  driverProfileUserId: string | null;
  vehicleLicensePlate: string | null;
};

const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (message: string, details?: unknown) => Object.assign(new Error(message), { status: 409, details });
const validDate = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const requireAddress = (label: string, address: Record<string, string | null>) => {
  const missing = ['name', 'street', 'city', 'state', 'postalCode'].filter((key) => !text(address[key], 240));
  if (missing.length) throw fail(`${label} is incomplete for the immutable NMT EVV record`, { missing });
};

export async function ensureCanonicalNmtEvvSchema(prisma: SqlClient) {
  const columns = [
    ['sourceNmtTripId', 'TEXT'],
    ['sourceNmtOrderId', 'TEXT'],
    ['nmtLegType', 'TEXT'],
    ['originName', 'TEXT'],
    ['originStreet', 'TEXT'],
    ['originCity', 'TEXT'],
    ['originState', 'TEXT'],
    ['originPostalCode', 'TEXT'],
    ['destinationName', 'TEXT'],
    ['destinationStreet', 'TEXT'],
    ['destinationCity', 'TEXT'],
    ['destinationState', 'TEXT'],
    ['destinationPostalCode', 'TEXT'],
    ['vehicleLicensePlate', 'TEXT'],
    ['personsPresent', "JSONB NOT NULL DEFAULT '[]'::jsonb"],
    ['driverSignature', 'TEXT'],
    ['driverSignatureSha256', 'TEXT'],
    ['driverSignatureMethod', 'TEXT'],
    ['driverSignedAt', 'TIMESTAMPTZ'],
    ['driverSignerUserId', 'TEXT'],
    ['signatureCapturedByUserId', 'TEXT'],
    ['nmtOdometerStart', 'NUMERIC'],
    ['nmtOdometerEnd', 'NUMERIC'],
    ['nmtMilesDriven', 'NUMERIC'],
    ['immutableAt', 'TIMESTAMPTZ'],
  ] as const;
  for (const [name, definition] of columns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`);
  }
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvVisit_nmt_trip_uq"
    ON "SpireEvvVisit"("organizationId","legalEntityId","sourceNmtTripId")
    WHERE "sourceNmtTripId" IS NOT NULL`);
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "spire_protect_immutable_nmt_evv"() RETURNS trigger AS $$
    BEGIN
      IF TG_OP='DELETE' THEN
        IF OLD."sourceNmtTripId" IS NOT NULL AND OLD."immutableAt" IS NOT NULL THEN
          RAISE EXCEPTION 'Immutable NMT EVV visit records cannot be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD."sourceNmtTripId" IS NOT NULL AND OLD."immutableAt" IS NOT NULL AND (
        NEW."sourceNmtTripId" IS DISTINCT FROM OLD."sourceNmtTripId" OR
        NEW."sourceNmtOrderId" IS DISTINCT FROM OLD."sourceNmtOrderId" OR
        NEW."nmtLegType" IS DISTINCT FROM OLD."nmtLegType" OR
        NEW."originName" IS DISTINCT FROM OLD."originName" OR
        NEW."originStreet" IS DISTINCT FROM OLD."originStreet" OR
        NEW."originCity" IS DISTINCT FROM OLD."originCity" OR
        NEW."originState" IS DISTINCT FROM OLD."originState" OR
        NEW."originPostalCode" IS DISTINCT FROM OLD."originPostalCode" OR
        NEW."destinationName" IS DISTINCT FROM OLD."destinationName" OR
        NEW."destinationStreet" IS DISTINCT FROM OLD."destinationStreet" OR
        NEW."destinationCity" IS DISTINCT FROM OLD."destinationCity" OR
        NEW."destinationState" IS DISTINCT FROM OLD."destinationState" OR
        NEW."destinationPostalCode" IS DISTINCT FROM OLD."destinationPostalCode" OR
        NEW."vehicleLicensePlate" IS DISTINCT FROM OLD."vehicleLicensePlate" OR
        NEW."personsPresent" IS DISTINCT FROM OLD."personsPresent" OR
        NEW."driverSignature" IS DISTINCT FROM OLD."driverSignature" OR
        NEW."driverSignatureSha256" IS DISTINCT FROM OLD."driverSignatureSha256" OR
        NEW."driverSignatureMethod" IS DISTINCT FROM OLD."driverSignatureMethod" OR
        NEW."driverSignedAt" IS DISTINCT FROM OLD."driverSignedAt" OR
        NEW."driverSignerUserId" IS DISTINCT FROM OLD."driverSignerUserId" OR
        NEW."signatureCapturedByUserId" IS DISTINCT FROM OLD."signatureCapturedByUserId" OR
        NEW."nmtOdometerStart" IS DISTINCT FROM OLD."nmtOdometerStart" OR
        NEW."nmtOdometerEnd" IS DISTINCT FROM OLD."nmtOdometerEnd" OR
        NEW."nmtMilesDriven" IS DISTINCT FROM OLD."nmtMilesDriven" OR
        NEW."immutableAt" IS DISTINCT FROM OLD."immutableAt"
      ) THEN
        RAISE EXCEPTION 'Immutable NMT EVV route/signature evidence cannot be overwritten; use the corrections workflow';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "SpireEvvVisit_immutable_nmt_evv" ON "SpireEvvVisit"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "SpireEvvVisit_immutable_nmt_evv"
    BEFORE UPDATE OR DELETE ON "SpireEvvVisit"
    FOR EACH ROW EXECUTE FUNCTION "spire_protect_immutable_nmt_evv"()`);
}

async function loadTrip(prisma: SqlClient, input: CreateInput): Promise<TripSnapshot> {
  const rows = await prisma.$queryRawUnsafe<TripSnapshot[]>(
    `SELECT trip.*,
       transport_order."pickupName",transport_order."pickupStreet",transport_order."pickupCity",transport_order."pickupState",transport_order."pickupPostalCode",
       transport_order."dropoffName",transport_order."dropoffStreet",transport_order."dropoffCity",transport_order."dropoffState",transport_order."dropoffPostalCode",
       driver."displayName" AS "driverName",driver."userId" AS "driverProfileUserId",
       vehicle."licensePlate" AS "vehicleLicensePlate"
     FROM "NmtTrip" trip
     JOIN "NmtTransportOrder" transport_order ON transport_order."id"=trip."orderId"
       AND transport_order."organizationId"=trip."organizationId" AND transport_order."legalEntityId"=trip."legalEntityId"
     LEFT JOIN "NmtDriverAssignmentProfile" driver ON driver."id"=trip."driverProfileId"
       AND driver."organizationId"=trip."organizationId" AND driver."legalEntityId"=trip."legalEntityId"
     LEFT JOIN "NmtVehicle" vehicle ON vehicle."id"=trip."vehicleId"
       AND vehicle."organizationId"=trip."organizationId" AND vehicle."legalEntityId"=trip."legalEntityId"
     WHERE trip."organizationId"=$1 AND trip."legalEntityId"=$2 AND trip."id"=$3 LIMIT 1`,
    input.organizationId,
    input.legalEntityId,
    input.tripId,
  );
  if (!rows[0]) throw fail('NMT trip was not found while creating the canonical EVV visit');
  return rows[0];
}

export async function createCanonicalNmtEvvVisit(prisma: SqlClient, input: CreateInput) {
  const trip = await loadTrip(prisma, input);
  if (!trip.patientId) throw fail('NMT trip cannot complete without a linked client/patient');
  if (!trip.driverUserId || !trip.driverProfileId) throw fail('NMT trip cannot complete without an assigned driver');
  if (!trip.vehicleId || !text(trip.vehicleLicensePlate, 80)) throw fail('NMT trip cannot complete without a vehicle license plate');
  if (trip.driverProfileUserId && String(trip.driverProfileUserId) !== String(trip.driverUserId)) {
    throw fail('Assigned NMT driver identity does not match the dispatch profile');
  }

  const isReturn = String(trip.legType || '').toUpperCase() === 'RETURN';
  const pickup = {
    name: trip.pickupName,
    street: trip.pickupStreet,
    city: trip.pickupCity,
    state: trip.pickupState,
    postalCode: trip.pickupPostalCode,
  };
  const dropoff = {
    name: trip.dropoffName,
    street: trip.dropoffStreet,
    city: trip.dropoffCity,
    state: trip.dropoffState,
    postalCode: trip.dropoffPostalCode,
  };
  const origin = isReturn ? dropoff : pickup;
  const destination = isReturn ? pickup : dropoff;
  requireAddress('Trip origin', origin);
  requireAddress('Trip destination', destination);

  const clockInAt = validDate(trip.riderOnBoardAt) || validDate(trip.departedPickupAt) || validDate(trip.arrivedPickupAt);
  const clockOutAt = validDate(trip.arrivedDropoffAt) || validDate(trip.completedAt);
  if (!clockInAt || !clockOutAt || clockOutAt.getTime() < clockInAt.getTime()) {
    throw fail('NMT trip requires valid pickup/on-board and drop-off timestamps before completion');
  }

  const evidence = input.evidence;
  const providerMedicaidId = text(evidence.providerMedicaidId, 80);
  const patientMedicaidId = text(evidence.patientMedicaidId, 80);
  const payer = text(evidence.payer, 120);
  const payerProgram = text(evidence.payerProgram, 120);
  const procedureCode = text(evidence.procedureCode, 120);
  const signature = text(evidence.driverSignature, 500000);
  if (!providerMedicaidId || !patientMedicaidId || !payer || !payerProgram || !procedureCode || !signature) {
    throw fail('Provider ID, patient Medicaid ID, payer, payer program, procedure code, and driver signature are required for canonical NMT EVV');
  }

  const driverName = text(trip.driverName, 250) || String(trip.driverUserId);
  const personsPresent = [
    { type: 'CLIENT', id: String(trip.patientId) },
    { type: 'DRIVER', id: String(trip.driverUserId), name: driverName },
    ...(evidence.otherPersonsPresent || []).map((name) => ({ type: 'OTHER', name: text(name, 200) })).filter((item) => item.name),
  ];
  const signatureHash = createHash('sha256').update(signature, 'utf8').digest('hex');
  const signedAt = validDate(trip.completedAt) || new Date();
  const hoursToBillMinutes = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000));
  const visitOtherId = `NMT:${trip.id}`;
  const patientOtherId = text(evidence.patientOtherId, 120) || String(trip.patientId);
  const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireEvvVisit" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "sourceNmtTripId"=$3 LIMIT 1`,
    input.organizationId,
    input.legalEntityId,
    trip.id,
  );
  if (existing[0]) return existing[0];

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `INSERT INTO "SpireEvvVisit"(
      "organizationId","legalEntityId","patientId","authorizationId","employeeUserId","appointmentId","serviceCode",
      "scheduledStart","scheduledEnd","verificationMethod","status","clockInAt","clockOutAt","verifiedAt","verifiedById",
      "visitOtherId","providerMedicaidId","patientOtherId","patientMedicaidId","staffOtherId","payer","payerProgram",
      "procedureCode","timeZone","visitLocationType","billVisit","hoursToBillMinutes","visitMemo","transmissionState",
      "sourceNmtTripId","sourceNmtOrderId","nmtLegType",
      "originName","originStreet","originCity","originState","originPostalCode",
      "destinationName","destinationStreet","destinationCity","destinationState","destinationPostalCode",
      "vehicleLicensePlate","personsPresent","driverSignature","driverSignatureSha256","driverSignatureMethod","driverSignedAt",
      "driverSignerUserId","signatureCapturedByUserId","nmtOdometerStart","nmtOdometerEnd","nmtMilesDriven","immutableAt"
    ) VALUES(
      $1,$2,$3,NULL,$4,NULL,$5,$6,$7,'NMT_MOBILE','VERIFIED',$8,$9,NOW(),$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,'2',TRUE,$20,$21,'DIRTY',
      $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb,$37,$38,$39,$40,$41,$42,$43,$44,$45,NOW()
    ) RETURNING *`,
    input.organizationId,
    input.legalEntityId,
    trip.patientId,
    trip.driverUserId,
    procedureCode,
    trip.scheduledPickupAt ?? clockInAt,
    trip.scheduledDropoffAt ?? clockOutAt,
    clockInAt,
    clockOutAt,
    input.actorUserId,
    visitOtherId,
    providerMedicaidId,
    patientOtherId,
    patientMedicaidId,
    trip.driverUserId,
    payer,
    payerProgram,
    procedureCode,
    text(evidence.timeZone, 80) || 'US/Eastern',
    hoursToBillMinutes,
    `NMT ${text(origin.name, 240)} to ${text(destination.name, 240)}`,
    trip.id,
    trip.orderId,
    text(trip.legType, 40) || 'OUTBOUND',
    text(origin.name, 240),
    text(origin.street, 240),
    text(origin.city, 120),
    text(origin.state, 40),
    text(origin.postalCode, 40),
    text(destination.name, 240),
    text(destination.street, 240),
    text(destination.city, 120),
    text(destination.state, 40),
    text(destination.postalCode, 40),
    text(trip.vehicleLicensePlate, 80),
    JSON.stringify(personsPresent),
    signature,
    signatureHash,
    evidence.driverSignatureMethod || 'ELECTRONIC',
    signedAt,
    trip.driverUserId,
    input.actorUserId,
    trip.odometerStart ?? null,
    trip.odometerEnd ?? null,
    trip.milesDriven ?? null,
  );
  return rows[0];
}
