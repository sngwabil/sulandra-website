import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  applicantUsernameFor,
  careersHrDisplayName,
  careersPortalUrl,
  recordAndDeliver,
} from './applicant-workflow.js';
import { entityAccessOf, requireEntityManageAccess } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (
    auth: Partial<AuthContext>,
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: object,
  ) => Promise<void>;
};

const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_LOCATION = '822 Dalewood Pl, Suite A, Dayton, Ohio 45426';
const schedulingPage = (
  process.env.INTERVIEW_SCHEDULING_URL
  ?? 'https://www.sulandrahealth.com/interview-scheduling.html'
).replace(/\/$/, '');

const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  addressLine1: z.string().trim().min(2).max(160),
  addressLine2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  emailDisplayName: z.string().trim().min(2).max(160).default(careersHrDisplayName),
  timeZone: z.string().trim().min(3).max(100).default(DEFAULT_TIME_ZONE),
});

const invitationSchema = z.object({
  slotIds: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  startsAt: z.array(z.coerce.date()).max(50).default([]),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  mode: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).default('IN_PERSON'),
  locationOrLink: z.string().trim().max(500).optional(),
  expiresAt: z.coerce.date().optional(),
  note: z.string().trim().max(4000).optional(),
});

const selectSlotSchema = z.object({
  slotId: z.string().trim().min(1).max(120),
  acknowledgedRescheduleRisk: z.boolean().default(false),
});

function requestError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function formattedAddress(settings: any) {
  return [
    settings?.addressLine1,
    settings?.addressLine2,
    settings?.city,
    [settings?.state, settings?.postalCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || DEFAULT_LOCATION;
}

function dateTimeText(value: unknown, timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(String(value));
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function reschedulePolicy(startsAt: unknown, timeZone: string, now = new Date()) {
  const interview = new Date(String(startsAt));
  if (Number.isNaN(interview.getTime()) || interview.getTime() <= now.getTime()) {
    return { allowed: false, reason: 'This interview has already started or passed and can no longer be changed.' };
  }
  const currentParts = zonedParts(now, timeZone);
  const interviewParts = zonedParts(interview, timeZone);
  const sameDate = currentParts.year === interviewParts.year
    && currentParts.month === interviewParts.month
    && currentParts.day === interviewParts.day;
  if (sameDate && currentParts.hour >= 5) {
    return {
      allowed: false,
      reason: `Interview appointments cannot be changed after 5:00 AM ${timeZone} on the morning of the interview. Contact Human Resources directly if an emergency prevents attendance.`,
    };
  }
  return { allowed: true, reason: null };
}

async function companySettings(prisma: PrismaClient, organizationId: string, legalEntityId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT setting.*,entity."displayName" AS "entityDisplayName"
       FROM "LegalEntity" entity
       LEFT JOIN "CompanySetting" setting
         ON setting."organizationId"=entity."organizationId" AND setting."legalEntityId"=entity."id"
      WHERE entity."organizationId"=$1 AND entity."id"=$2
      LIMIT 1`,
    organizationId,
    legalEntityId,
  );
  const row = rows[0];
  return row?.organizationId ? row : {
    organizationId,
    legalEntityId,
    companyName: row?.entityDisplayName || 'Sulandra Health',
    addressLine1: '822 Dalewood Pl',
    addressLine2: 'Suite A',
    city: 'Dayton',
    state: 'Ohio',
    postalCode: '45426',
    emailDisplayName: careersHrDisplayName,
    timeZone: DEFAULT_TIME_ZONE,
  };
}

async function invitationByToken(prisma: PrismaClient, token: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT i.*,a."firstName",a."middleName",a."lastName",a."email",a."phone",
            a."preferredCommunication",a."referenceNumber",a."workflowStatus",a."applicantUsername",
            j."title" AS "jobTitle"
       FROM "InterviewInvitation" i
       JOIN "EmployeeApplication" a ON a."id"=i."applicationId" AND a."legalEntityId"=i."legalEntityId"
       LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId" AND j."legalEntityId"=a."legalEntityId"
      WHERE i."tokenHash"=$1
      LIMIT 1`,
    hashToken(token),
  );
  return rows[0] || null;
}

function interviewInvitationMessage(application: any, url: string, deadline: Date, note: string | undefined, timeZone: string, companyName: string) {
  return [
    `Dear ${application.firstName},`,
    '',
    `The ${careersHrDisplayName} is pleased to inform you that your application for ${application.jobTitle || 'the position'} has advanced to the interview stage.`,
    '',
    'Please use the secure scheduling link below to review the interview appointments currently available and select the date and time that works best for you. Available appointments are shared across candidates and remain open only until another applicant selects them.',
    '',
    `Schedule your interview: ${url}`,
    `Selection deadline: ${dateTimeText(deadline, timeZone)}`,
    '',
    'After you select an appointment, the time will be locked to your application and you will receive a confirmation. Keep this link because it can also be used to review or, when permitted, change your appointment to another available time.',
    note ? `Additional message from Human Resources:\n${note}` : '',
    '',
    `Application reference: ${application.referenceNumber}`,
    `Applicant username: ${applicantUsernameFor(application)}`,
    `Applicant portal: ${careersPortalUrl}`,
    '',
    'Sincerely,',
    careersHrDisplayName,
    companyName,
  ].filter((line) => line !== undefined && line !== null).join('\n');
}

function interviewConfirmationMessage(application: any, slot: any, url: string, timeZone: string, changed: boolean, companyName: string) {
  return [
    `Dear ${application.firstName},`,
    '',
    `Your interview appointment for ${application.jobTitle || 'the position'} has been ${changed ? 'changed and reconfirmed' : 'confirmed'}.`,
    '',
    `Date and time: ${dateTimeText(slot.startsAt, timeZone)}`,
    `Interview format: ${String(slot.mode || 'IN_PERSON').replaceAll('_', ' ')}`,
    `Location or connection details: ${slot.locationOrLink || DEFAULT_LOCATION}`,
    '',
    `Review your appointment: ${url}`,
    `Application reference: ${application.referenceNumber}`,
    `Applicant username: ${applicantUsernameFor(application)}`,
    `Applicant portal: ${careersPortalUrl}`,
    '',
    'Please arrive or connect on time and bring any documents previously requested by Human Resources.',
    '',
    'Sincerely,',
    careersHrDisplayName,
    companyName,
  ].join('\n');
}

export function registerInterviewSchedulingRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.get(
    '/api/admin/company-settings',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (_req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        res.json({ data: await companySettings(prisma, auth.organizationId, access.legalEntityId) });
      } catch (error) { next(error); }
    },
  );

  app.patch(
    '/api/admin/company-settings',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        const input = companySettingsSchema.parse(req.body);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "CompanySetting"
            ("organizationId","legalEntityId","companyName","addressLine1","addressLine2","city","state","postalCode","emailDisplayName","timeZone","updatedById","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
           ON CONFLICT ("organizationId","legalEntityId") DO UPDATE SET
             "companyName"=EXCLUDED."companyName","addressLine1"=EXCLUDED."addressLine1",
             "addressLine2"=EXCLUDED."addressLine2","city"=EXCLUDED."city",
             "state"=EXCLUDED."state","postalCode"=EXCLUDED."postalCode",
             "emailDisplayName"=EXCLUDED."emailDisplayName","timeZone"=EXCLUDED."timeZone",
             "updatedById"=EXCLUDED."updatedById","updatedAt"=NOW()`,
          auth.organizationId, access.legalEntityId, input.companyName, input.addressLine1, input.addressLine2,
          input.city, input.state, input.postalCode, careersHrDisplayName, input.timeZone, auth.userId,
        );
        await audit(auth, 'UPDATE_COMPANY_SETTINGS', 'CompanySetting', access.legalEntityId, { legalEntityId: access.legalEntityId });
        res.json({ data: await companySettings(prisma, auth.organizationId, access.legalEntityId) });
      } catch (error) { next(error); }
    },
  );

  app.get(
    '/api/admin/interview-slots',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        const applicationId = String(req.query.applicationId || '');
        const slots = await prisma.$queryRawUnsafe<any[]>(
          `SELECT s.*,a."firstName" AS "bookedFirstName",a."lastName" AS "bookedLastName",
                  EXISTS (
                    SELECT 1 FROM "InterviewInvitationSlot" x
                    JOIN "InterviewInvitation" i ON i."id"=x."invitationId"
                    WHERE x."slotId"=s."id" AND i."applicationId"=$2 AND i."status"='ACTIVE'
                  ) AS "invitedToCurrentApplication"
             FROM "InterviewSlot" s
             LEFT JOIN "EmployeeApplication" a ON a."id"=s."bookedApplicationId"
            WHERE s."organizationId"=$1 AND s."legalEntityId"=$3
              AND ($4::text IS NULL OR s."departmentId"=$4)
              AND s."startsAt">NOW()
            ORDER BY s."startsAt"
            LIMIT 500`,
          auth.organizationId, applicationId, access.legalEntityId, access.departmentId,
        );
        const settings = await companySettings(prisma, auth.organizationId, access.legalEntityId);
        res.json({ data: { slots, companyDetails: { ...settings, formattedAddress: formattedAddress(settings) } } });
      } catch (error) { next(error); }
    },
  );

  app.delete(
    '/api/admin/interview-slots/:slotId',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        const changed = await prisma.$executeRawUnsafe(
          `UPDATE "InterviewSlot" SET "status"='CANCELLED',"updatedAt"=NOW()
            WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3
              AND ($4::text IS NULL OR "departmentId"=$4) AND "status"='AVAILABLE'`,
          String(req.params.slotId), auth.organizationId, access.legalEntityId, access.departmentId,
        );
        if (!changed) return res.status(409).json({ error: 'Only an unbooked interview time can be cancelled.' });
        await audit(auth, 'CANCEL_INTERVIEW_SLOT', 'InterviewSlot', String(req.params.slotId));
        res.json({ data: { cancelled: true } });
      } catch (error) { next(error); }
    },
  );

  app.post(
    '/api/admin/applications/:id/interview-slots',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        const applicationId = String(req.params.id);
        const input = invitationSchema.parse(req.body);
        const applicationRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2 AND a."legalEntityId"=$3
              AND ($4::text IS NULL OR a."departmentId"=$4)`,
          applicationId, auth.organizationId, access.legalEntityId, access.departmentId,
        );
        const application = applicationRows[0];
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (!application.email) return res.status(400).json({ error: 'An applicant email address is required to send an interview invitation.' });

        const settings = await companySettings(prisma, auth.organizationId, access.legalEntityId);
        const defaultLocation = input.locationOrLink || formattedAddress(settings);
        const uniqueStarts = [...new Map(input.startsAt.map((date) => [date.toISOString(), date])).values()];
        const now = Date.now();
        if (uniqueStarts.some((date) => date.getTime() <= now + 30 * 60 * 1000)) {
          return res.status(400).json({ error: 'Interview times must begin at least 30 minutes in the future.' });
        }
        const requestedExpiry = input.expiresAt || new Date(now + 7 * 24 * 60 * 60 * 1000);
        if (requestedExpiry.getTime() <= now + 15 * 60 * 1000) {
          return res.status(400).json({ error: 'The scheduling link must remain open for at least 15 minutes.' });
        }

        const invitationId = randomUUID();
        const rawToken = randomBytes(32).toString('base64url');
        const scheduling = await prisma.$transaction(async (tx) => {
          const selected = new Set(input.slotIds);
          for (const startsAt of uniqueStarts) {
            const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
            const inserted = await tx.$queryRawUnsafe<any[]>(
              `INSERT INTO "InterviewSlot"
                ("id","organizationId","legalEntityId","departmentId","startsAt","endsAt","mode","locationOrLink","status","createdById","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AVAILABLE',$9,NOW(),NOW())
               ON CONFLICT ("organizationId","legalEntityId","startsAt") DO UPDATE SET "updatedAt"=NOW()
               RETURNING "id"`,
              randomUUID(), auth.organizationId, access.legalEntityId, application.departmentId,
              startsAt, endsAt, input.mode, defaultLocation, auth.userId,
            );
            if (inserted[0]?.id) selected.add(inserted[0].id);
          }
          if (!selected.size) throw requestError(400, 'Select or add at least one interview time.');
          const available: Array<{ id: string; startsAt: Date }> = [];
          for (const slotId of selected) {
            const rows = await tx.$queryRawUnsafe<any[]>(
              `SELECT "id","status","bookedApplicationId","startsAt"
                 FROM "InterviewSlot"
                WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`,
              slotId, auth.organizationId, access.legalEntityId,
            );
            const slot = rows[0];
            if (!slot) throw requestError(409, 'One of the selected interview times no longer exists.');
            const startsAt = new Date(slot.startsAt);
            if (startsAt.getTime() <= now + 30 * 60 * 1000) {
              throw requestError(400, 'Interview times must begin at least 30 minutes in the future.');
            }
            if (slot.status === 'AVAILABLE' || slot.bookedApplicationId === applicationId) {
              available.push({ id: slot.id, startsAt });
            }
          }
          if (!available.length) throw requestError(409, 'Every selected interview time is already booked. Add another available time.');
          const earliestStart = Math.min(...available.map((slot) => slot.startsAt.getTime()));
          const effectiveExpiresAt = new Date(Math.min(
            requestedExpiry.getTime(),
            earliestStart - 15 * 60 * 1000,
          ));
          if (effectiveExpiresAt.getTime() <= now + 15 * 60 * 1000) {
            throw requestError(400, 'The selected times are too soon to provide a usable scheduling period. Add a later interview time.');
          }

          await tx.$executeRawUnsafe(
            `UPDATE "InterviewInvitation" SET "status"='CLOSED',"updatedAt"=NOW()
              WHERE "applicationId"=$1 AND "legalEntityId"=$2 AND "status"='ACTIVE'`,
            applicationId, access.legalEntityId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "InterviewInvitation"
              ("id","organizationId","legalEntityId","departmentId","applicationId","tokenHash","expiresAt","status","note","createdById","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9,NOW(),NOW())`,
            invitationId, auth.organizationId, access.legalEntityId, application.departmentId,
            applicationId, hashToken(rawToken), effectiveExpiresAt, input.note || null, auth.userId,
          );
          for (const slot of available) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "InterviewInvitationSlot" ("invitationId","slotId","createdAt") VALUES ($1,$2,NOW())`,
              invitationId, slot.id,
            );
          }
          const previousStatus = application.workflowStatus || application.status || 'REVIEWING';
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication" SET "workflowStatus"='INTERVIEW',"updatedAt"=NOW() WHERE "id"=$1`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             VALUES ($1,$2,$3,'INTERVIEW',$4,TRUE,$5,NOW())`,
            randomUUID(), applicationId, previousStatus,
            input.note || 'Human Resources invited the applicant to select an interview appointment.', auth.userId,
          );
          return { slotIds: available.map((slot) => slot.id), expiresAt: effectiveExpiresAt };
        });

        const url = `${schedulingPage}?token=${encodeURIComponent(rawToken)}`;
        const deliveryStatus = await recordAndDeliver(
          prisma,
          { ...application, preferredCommunication: 'EMAIL' },
          'INTERVIEW_INVITATION',
          `Select your ${settings.companyName} interview appointment — ${application.referenceNumber}`,
          interviewInvitationMessage(application, url, scheduling.expiresAt, input.note, settings.timeZone || DEFAULT_TIME_ZONE, settings.companyName),
          auth.userId,
        );
        await audit(auth, 'SEND_INTERVIEW_INVITATION', 'InterviewInvitation', invitationId, {
          applicationId, legalEntityId: access.legalEntityId, departmentId: application.departmentId,
          slotCount: scheduling.slotIds.length, deliveryStatus, expiresAt: scheduling.expiresAt,
        });
        res.status(201).json({ data: { invitationId, slotIds: scheduling.slotIds, expiresAt: scheduling.expiresAt, deliveryStatus } });
      } catch (error) { next(error); }
    },
  );

  app.get('/public/careers/interviews/:token', async (req, res, next) => {
    try {
      const invitation = await invitationByToken(prisma, String(req.params.token));
      if (!invitation) return res.status(404).json({ error: 'Interview invitation not found.' });
      const settings = await companySettings(prisma, invitation.organizationId, invitation.legalEntityId);
      const slots = await prisma.$queryRawUnsafe<any[]>(
        `SELECT s."id",s."startsAt",s."endsAt",s."mode",s."locationOrLink",s."status",
                s."bookedApplicationId",
                (s."bookedApplicationId"=$2 AND s."status"='BOOKED') AS "selectedByApplicant",
                (s."status"<>'AVAILABLE' AND NOT (s."bookedApplicationId"=$2 AND s."status"='BOOKED')) AS "unavailable"
           FROM "InterviewInvitationSlot" x
           JOIN "InterviewSlot" s ON s."id"=x."slotId"
          WHERE x."invitationId"=$1 AND s."legalEntityId"=$3
          ORDER BY s."startsAt"`,
        invitation.id, invitation.applicationId, invitation.legalEntityId,
      );
      const currentRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "InterviewSlot" WHERE "bookedApplicationId"=$1 AND "legalEntityId"=$2 AND "status"='BOOKED' ORDER BY "startsAt" LIMIT 1`,
        invitation.applicationId, invitation.legalEntityId,
      );
      const current = currentRows[0] || null;
      if (current && !slots.some((slot) => slot.id === current.id)) {
        slots.push({ ...current, selectedByApplicant: true, unavailable: false });
        slots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      }
      const policy = current
        ? reschedulePolicy(current.startsAt, settings.timeZone || DEFAULT_TIME_ZONE)
        : { allowed: true, reason: null };
      const invitationOpen = invitation.status === 'ACTIVE' && new Date(invitation.expiresAt).getTime() > Date.now();
      res.json({ data: {
        applicant: {
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          referenceNumber: invitation.referenceNumber,
          jobTitle: invitation.jobTitle,
        },
        invitation: {
          expiresAt: invitation.expiresAt,
          open: invitationOpen,
          note: invitation.note,
        },
        slots,
        selectedSlot: current,
        canReschedule: invitationOpen && policy.allowed,
        rescheduleBlockedReason: invitationOpen ? policy.reason : 'This scheduling link is no longer open for appointment changes.',
        companyDetails: { ...settings, formattedAddress: formattedAddress(settings) },
      } });
    } catch (error) { next(error); }
  });

  app.post('/public/careers/interviews/:token/select', async (req, res, next) => {
    try {
      const input = selectSlotSchema.parse(req.body);
      const invitation = await invitationByToken(prisma, String(req.params.token));
      if (!invitation) return res.status(404).json({ error: 'Interview invitation not found.' });
      if (invitation.status !== 'ACTIVE' || new Date(invitation.expiresAt).getTime() <= Date.now()) {
        return res.status(410).json({ error: 'This interview scheduling link has expired. Contact Human Resources for assistance.' });
      }
      const settings = await companySettings(prisma, invitation.organizationId, invitation.legalEntityId);
      const result = await prisma.$transaction(async (tx) => {
        const permitted = await tx.$queryRawUnsafe<any[]>(
          `SELECT s.* FROM "InterviewInvitationSlot" x
             JOIN "InterviewSlot" s ON s."id"=x."slotId"
            WHERE x."invitationId"=$1 AND x."slotId"=$2 AND s."legalEntityId"=$3`,
          invitation.id, input.slotId, invitation.legalEntityId,
        );
        const target = permitted[0];
        if (!target) throw requestError(400, 'That appointment is not part of this interview invitation.');
        const currentRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "InterviewSlot" WHERE "bookedApplicationId"=$1 AND "legalEntityId"=$2 AND "status"='BOOKED' ORDER BY "startsAt" LIMIT 1`,
          invitation.applicationId, invitation.legalEntityId,
        );
        const current = currentRows[0] || null;
        if (current?.id === target.id) return { slot: current, changed: false, alreadySelected: true };
        if (current) {
          const policy = reschedulePolicy(current.startsAt, settings.timeZone || DEFAULT_TIME_ZONE);
          if (!policy.allowed) throw requestError(409, policy.reason || 'This appointment can no longer be changed.');
          if (!input.acknowledgedRescheduleRisk) {
            throw requestError(400, 'Confirm the rescheduling notice before changing your interview appointment.');
          }
        }
        const locked = await tx.$queryRawUnsafe<any[]>(
          `UPDATE "InterviewSlot"
              SET "status"='BOOKED',"bookedApplicationId"=$1,"bookedAt"=NOW(),"updatedAt"=NOW()
            WHERE "id"=$2 AND "organizationId"=$3 AND "legalEntityId"=$4 AND "status"='AVAILABLE'
              AND "bookedApplicationId" IS NULL AND "startsAt">NOW()
            RETURNING *`,
          invitation.applicationId, target.id, invitation.organizationId, invitation.legalEntityId,
        );
        if (!locked[0]) throw requestError(409, 'That appointment was just selected by another applicant. Please choose another available time.');
        if (current) {
          await tx.$executeRawUnsafe(
            `UPDATE "InterviewSlot"
                SET "status"='AVAILABLE',"bookedApplicationId"=NULL,"bookedAt"=NULL,
                    "reminderSentAt"=NULL,"updatedAt"=NOW()
              WHERE "id"=$1 AND "bookedApplicationId"=$2 AND "legalEntityId"=$3`,
            current.id, invitation.applicationId, invitation.legalEntityId,
          );
        }
        const note = `${current ? 'Interview rescheduled' : 'Interview scheduled'} for ${dateTimeText(locked[0].startsAt, settings.timeZone || DEFAULT_TIME_ZONE)}.`;
        await tx.$executeRawUnsafe(
          `INSERT INTO "ApplicantStatusHistory"
            ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","createdAt")
           VALUES ($1,$2,'INTERVIEW','INTERVIEW',$3,TRUE,NOW())`,
          randomUUID(), invitation.applicationId, note,
        );
        return { slot: locked[0], changed: Boolean(current), alreadySelected: false };
      });

      if (!result.alreadySelected) {
        const url = `${schedulingPage}?token=${encodeURIComponent(String(req.params.token))}`;
        await recordAndDeliver(
          prisma,
          { ...invitation, id: invitation.applicationId, preferredCommunication: 'EMAIL' },
          'INTERVIEW_INVITATION',
          `${result.changed ? 'Updated' : 'Confirmed'} interview appointment — ${invitation.referenceNumber}`,
          interviewConfirmationMessage(invitation, result.slot, url, settings.timeZone || DEFAULT_TIME_ZONE, result.changed, settings.companyName),
          null,
        );
        await audit(
          { organizationId: invitation.organizationId },
          result.changed ? 'RESCHEDULE_INTERVIEW' : 'BOOK_INTERVIEW',
          'InterviewSlot',
          result.slot.id,
          { applicationId: invitation.applicationId, legalEntityId: invitation.legalEntityId },
        );
      }
      res.json({ data: { selectedSlot: result.slot, changed: result.changed } });
    } catch (error) { next(error); }
  });
}
