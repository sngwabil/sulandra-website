import type express from 'express';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { entityAccessOf, requireDepartmentMatch, requireEntityManageAccess } from './entity-access.js';
import { educationCourseAssessments } from './education-course-assessments.js';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
};

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

type UserColumn = {
  columnName: string;
  isNullable: 'YES' | 'NO';
  columnDefault: string | null;
  dataType: string;
  udtName: string;
  isIdentity: 'YES' | 'NO';
  isGenerated: string;
};

const PORTAL_URL = 'https://www.sulandrahealth.com/employee-login.html';
const roleValues = new Set<string>(Object.values(UserRole));
const privilegedRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.CEO,
  UserRole.DOO,
]);

const hireSchema = z.object({
  employeeNumber: z.string().trim().max(80).optional().nullable(),
  role: z.string().trim().refine((value) => roleValues.has(value), 'Invalid employee role').optional(),
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  temporaryPassword: z.string().min(12).max(256).optional(),
  assignInitialTraining: z.boolean().default(true),
  trainingDueDate: z.coerce.date().optional(),
  courseCodes: z.array(z.string().trim().min(2).max(120)).max(50).optional(),
  sendWelcomeEmail: z.boolean().default(true),
  acknowledged: z.literal(true),
});

const accessResetSchema = z.object({
  sendWelcomeEmail: z.boolean().default(true),
  acknowledged: z.literal(true),
});

const commonCourses = [
  ['SUL-ORIENTATION', 'Sulandra New Employee Orientation'],
  ['SUL-HIPAA', 'HIPAA Privacy and Security'],
  ['SUL-WORKPLACE-SAFETY', 'Workplace Safety and Emergency Procedures'],
  ['SUL-HARASSMENT-PREVENTION', 'Harassment Prevention and Professional Conduct'],
  ['SUL-CYBERSECURITY', 'Cybersecurity and Phishing Awareness'],
  ['SUL-MULTI-COMPANY', 'Multi-Company Records and Access Boundaries'],
] as const;

const companyCourses: Record<string, ReadonlyArray<readonly [string, string]>> = {
  SCLS: [
    ['SCLS-PERSON-CENTERED', 'Person-Centered Community Living Services'],
    ['SCLS-MUI-UI-REPORTING', 'Major Unusual Incident and Unusual Incident Reporting'],
    ['SCLS-RIGHTS', 'Individual Rights and Abuse, Neglect, and Exploitation Prevention'],
  ],
  HOME_HEALTH: [
    ['HH-INFECTION-CONTROL', 'Home Health Infection Prevention and Control'],
    ['HH-PATIENT-RIGHTS', 'Home Health Patient Rights and Responsibilities'],
    ['HH-EMERGENCY', 'Home Health Emergency Preparedness'],
  ],
  NMT: [
    ['NMT-DEFENSIVE-DRIVING', 'Defensive Driving and Crash Prevention'],
    ['NMT-PASSENGER-SAFETY', 'Passenger Assistance, Securement, and Safety'],
    ['NMT-VEHICLE-INSPECTION', 'Pre-Trip Inspection and Vehicle Readiness'],
  ],
  SULANDRA_HEALTH: [
    ['SUL-CYBERSECURITY', 'Cybersecurity and Confidential Information'],
    ['SUL-MULTI-COMPANY', 'Sulandra Multi-Company Operations and Escalation'],
  ],
};

const roleCourses: Partial<Record<UserRole, ReadonlyArray<readonly [string, string]>>> = {
  [UserRole.DSP]: [['CARE-INFECTION-CONTROL', 'Infection Control for Direct Care Staff']],
  [UserRole.LPN]: [['CLINICAL-MEDICATION-SAFETY', 'Medication Safety and Clinical Documentation']],
  [UserRole.RN]: [['CLINICAL-MEDICATION-SAFETY', 'Medication Safety and Clinical Documentation']],
  [UserRole.DELEGATING_NURSE]: [['CLINICAL-DELEGATION', 'Nursing Delegation and Supervision']],
  [UserRole.DRIVER]: [['NMT-DEFENSIVE-DRIVING', 'Defensive Driving and Crash Prevention']],
};

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const temporaryPassword = () => `${randomBytes(9).toString('base64url')}Aa1!`;
const hashPortalPassword = (password: string) => {
  const salt = randomBytes(24);
  const derived = scryptSync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1_024 * 1_024,
  });
  return ['scrypt', 16_384, 8, 1, salt.toString('base64url'), derived.toString('base64url')].join('$');
};

const slug = (value: string) => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9._-]+/g, '.')
  .replace(/\.{2,}/g, '.')
  .replace(/^[._-]+|[._-]+$/g, '')
  .toLowerCase();

const roleForApplication = (value: unknown): UserRole => {
  const role = String(value || 'GENERAL').toUpperCase();
  const legacyOperationsApplicationRole = ['C', 'O', 'O'].join('');
  if (role === legacyOperationsApplicationRole || role === 'DOO') return UserRole.DOO;
  return roleValues.has(role) ? role as UserRole : UserRole.GENERAL;
};

const employmentTypeFor = (value: unknown) =>
  String(value || '').toUpperCase() === 'CONTRACT' ? 'CONTRACTOR' : 'EMPLOYEE';

async function availableUsername(
  tx: Prisma.TransactionClient,
  requested: string | undefined,
  email: string,
  firstName: string,
  lastName: string,
  entityCode: string,
) {
  const base = slug(requested || email.split('@')[0] || `${firstName}.${lastName}`) || `employee.${randomBytes(3).toString('hex')}`;
  for (const candidate of [base, `${base}.${entityCode.toLowerCase()}`, `${base}.${randomBytes(3).toString('hex')}`]) {
    const rows = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM "EmployeePortalCredential" WHERE LOWER("username")=LOWER($1)) AS "exists"`,
      candidate,
    );
    if (!rows[0]?.exists) return candidate;
  }
  return `${base}.${randomUUID().slice(0, 8)}`;
}

async function createUser(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    organizationId: string;
    email: string;
    role: UserRole;
    firstName: string;
    middleName: string | null;
    lastName: string;
    phone: string | null;
    username: string;
    passwordHash: string;
  },
) {
  const columns = await tx.$queryRawUnsafe<UserColumn[]>(
    `SELECT column_name AS "columnName",is_nullable AS "isNullable",column_default AS "columnDefault",
            data_type AS "dataType",udt_name AS "udtName",is_identity AS "isIdentity",is_generated AS "isGenerated"
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='User'
      ORDER BY ordinal_position`,
  );
  if (!columns.length) throw Object.assign(new Error('Employee identity storage is not initialized'), { status: 503 });
  const byName = new Map(columns.map((column) => [column.columnName, column]));
  const insertColumns: string[] = [];
  const valueSql: string[] = [];
  const values: unknown[] = [];
  const addValue = (name: string, value: unknown, cast = '') => {
    if (!byName.has(name)) return;
    insertColumns.push(`"${name}"`);
    values.push(value);
    valueSql.push(`$${values.length}${cast}`);
  };
  const addExpression = (name: string, expression: string) => {
    if (!byName.has(name)) return;
    insertColumns.push(`"${name}"`);
    valueSql.push(expression);
  };

  addValue('id', input.id);
  addValue('organizationId', input.organizationId);
  addValue('email', input.email);
  addValue('role', input.role, '::"UserRole"');
  addValue('firstName', input.firstName);
  addValue('middleName', input.middleName);
  addValue('lastName', input.lastName);
  addValue('phone', input.phone);
  addValue('username', input.username);
  addValue('displayName', [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' '));
  addValue('name', [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' '));
  addExpression('createdAt', 'NOW()');
  addExpression('updatedAt', 'NOW()');
  addValue('active', true);
  addValue('isActive', true);

  const passwordColumn = byName.get('passwordHash');
  if (passwordColumn?.isNullable === 'NO' && !passwordColumn.columnDefault) addValue('passwordHash', input.passwordHash);

  const statusColumn = byName.get('status');
  if (statusColumn?.isNullable === 'NO' && !statusColumn.columnDefault) {
    const safeUdt = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(statusColumn.udtName) ? statusColumn.udtName : null;
    addValue('status', 'ACTIVE', statusColumn.dataType === 'USER-DEFINED' && safeUdt ? `::"${safeUdt}"` : '');
  }

  const supported = new Set(insertColumns.map((name) => name.slice(1, -1)));
  const unsupportedRequired = columns.filter((column) =>
    column.isNullable === 'NO'
    && column.columnDefault === null
    && column.isIdentity !== 'YES'
    && column.isGenerated === 'NEVER'
    && !supported.has(column.columnName));
  if (unsupportedRequired.length) {
    throw Object.assign(
      new Error(`Employee identity storage requires unsupported fields: ${unsupportedRequired.map((column) => column.columnName).join(', ')}`),
      { status: 503 },
    );
  }

  const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string; role: string }>>(
    `INSERT INTO "User" (${insertColumns.join(',')}) VALUES (${valueSql.join(',')})
     RETURNING "id","email","role"::text AS "role"`,
    ...values,
  );
  return rows[0];
}

function trainingCourses(entityCode: string, role: UserRole, requested: string[] | undefined) {
  const defaults = [...commonCourses, ...(companyCourses[entityCode] || []), ...(roleCourses[role] || [])];
  const invalidRequestedCodes = (requested || []).filter((code) => !educationCourseAssessments[code]);
  if (invalidRequestedCodes.length) {
    throw Object.assign(new Error(`Unknown approved education course: ${invalidRequestedCodes.join(', ')}`), { status: 400 });
  }
  const requestedCourses = requested?.map((code) => [code, educationCourseAssessments[code].title] as const) || [];
  const unique = new Map<string, string>();
  for (const [code, title] of [...defaults, ...requestedCourses]) {
    const assessment = educationCourseAssessments[code];
    if (!assessment) throw Object.assign(new Error(`Hiring training is not published: ${code}`), { status: 503 });
    unique.set(code, assessment.title || title);
  }
  return [...unique].map(([code, title]) => ({ code, title }));
}

async function sendWelcome(
  companyName: string,
  recipient: string,
  displayName: string,
  username: string,
  password: string | null,
  trainingCount: number,
  accessReset = false,
) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) return { status: 'NOT_CONFIGURED' as const, error: null };
  const credentialText = password
    ? `Username: ${username}\nTemporary password: ${password}\nYou must create a new password at first sign-in.`
    : `Use your existing Sulandra employee-portal username and password. Username: ${username}`;
  const body = [
    `Hello ${displayName},`,
    '',
    accessReset
      ? `Your ${companyName} employee-portal access was securely reset. Previous employee sessions were signed out.`
      : `Welcome to ${companyName}. Your employee profile is active for onboarding and training.`,
    '',
    `Employee portal: ${PORTAL_URL}`,
    credentialText,
    '',
    `${trainingCount} initial training course${trainingCount === 1 ? '' : 's'} ${trainingCount === 1 ? 'has' : 'have'} been assigned. Complete all required onboarding and training before performing independent work.`,
    '',
    'Provider services, referrals, billing, and other licensed work remain subject to company approval, credential verification, training completion, and management authorization.',
    '',
    'Sulandra Health Human Resources Department',
    companyName,
  ].join('\n');
  try {
    const result = await createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { minVersion: 'TLSv1.2' },
    }).sendMail({
      from: `"Sulandra Health Human Resources Department" <${user}>`,
      to: recipient,
      subject: accessReset
        ? `${companyName} — employee portal access reset`
        : `Welcome to ${companyName} — employee portal and training`,
      text: body,
    });
    return { status: 'SENT' as const, error: null, providerMessageId: String(result.messageId || '') };
  } catch (error) {
    return { status: 'FAILED' as const, error: error instanceof Error ? error.message : 'Email delivery failed' };
  }
}

export function registerHiringProvisioningRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.post(
    '/api/admin/applications/:id/hire',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.DOO, UserRole.HR_MANAGER),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        const input = hireSchema.parse(req.body);
        if (!access.capabilities.includes('ONBOARDING')) {
          return void res.status(409).json({ error: `Onboarding is not enabled for ${access.legalEntityName}` });
        }
        if (input.assignInitialTraining && !access.capabilities.includes('EDUCATION')) {
          return void res.status(409).json({ error: `Education is not enabled for ${access.legalEntityName}` });
        }

        const applicationId = String(req.params.id);
        const requestedPassword = input.temporaryPassword || temporaryPassword();
        const passwordHash = hashPortalPassword(requestedPassword);
        const result = await prisma.$transaction(async (tx) => {
          const prior = await tx.$queryRawUnsafe<any[]>(
            `SELECT provisioning.*,credential."username"
               FROM "EmployeeHireProvisioning" provisioning
               LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=provisioning."userId"
              WHERE provisioning."organizationId"=$1 AND provisioning."applicationId"=$2
              LIMIT 1`,
            auth.organizationId,
            applicationId,
          );
          if (prior[0]) return { ...prior[0], duplicate: true, temporaryPassword: null };

          const applications = await tx.$queryRawUnsafe<any[]>(
            `SELECT application.*,entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName",
                    department."name" AS "departmentName"
               FROM "EmployeeApplication" application
               JOIN "LegalEntity" entity ON entity."organizationId"=application."organizationId" AND entity."id"=application."legalEntityId"
               LEFT JOIN "Department" department ON department."id"=application."departmentId" AND department."legalEntityId"=application."legalEntityId"
              WHERE application."id"=$1 AND application."organizationId"=$2 AND application."legalEntityId"=$3
                AND ($4::text IS NULL OR application."departmentId"=$4)
              LIMIT 1 FOR UPDATE OF application`,
            applicationId,
            auth.organizationId,
            access.legalEntityId,
            access.departmentId,
          );
          const application = applications[0];
          if (!application) throw Object.assign(new Error('Application not found'), { status: 404 });
          if (!application.email) throw Object.assign(new Error('Applicant email is required before hiring'), { status: 409 });
          if (application.departmentId) requireDepartmentMatch(access, application.departmentId);

          const offers = await tx.$queryRawUnsafe<any[]>(
            `SELECT * FROM "EmploymentOffer"
              WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "applicationId"=$3
              ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`,
            auth.organizationId,
            access.legalEntityId,
            applicationId,
          );
          const offer = offers[0];
          if (!offer?.acceptedAt || !['OFFER_ACCEPTED', 'DOCUMENTS_COMPLETE', 'EMPLOYEE_CREATED', 'HIRED'].includes(String(offer.status))) {
            throw Object.assign(new Error('A signed and accepted employment offer is required before hiring'), { status: 409 });
          }

          const requestedRole = (input.role as UserRole | undefined) || roleForApplication(application.appliedRole);
          if (privilegedRoles.has(requestedRole) && !access.enterpriseOwner) {
            throw Object.assign(new Error('Only the Enterprise Owner may provision an executive or administrator employee'), { status: 403 });
          }

          const email = normalizeEmail(application.email);
          const users = await tx.$queryRawUnsafe<any[]>(
            `SELECT "id","organizationId","email","role"::text AS "role"
               FROM "User" WHERE LOWER(COALESCE("email",''))=LOWER($1) LIMIT 1 FOR UPDATE`,
            email,
          );
          if (users[0] && users[0].organizationId !== auth.organizationId) {
            throw Object.assign(new Error('This email is already attached to a different organization'), { status: 409 });
          }

          const displayName = [application.firstName, application.middleName, application.lastName].filter(Boolean).join(' ');
          const credentialRows = users[0]
            ? await tx.$queryRawUnsafe<any[]>(`SELECT "username" FROM "EmployeePortalCredential" WHERE "userId"=$1 LIMIT 1`, users[0].id)
            : [];
          const username = credentialRows[0]?.username || await availableUsername(
            tx,
            input.username,
            email,
            String(application.firstName || ''),
            String(application.lastName || ''),
            String(application.legalEntityCode),
          );
          const user = users[0] || await createUser(tx, {
            id: randomUUID(),
            organizationId: auth.organizationId,
            email,
            role: requestedRole,
            firstName: String(application.firstName || ''),
            middleName: application.middleName ? String(application.middleName) : null,
            lastName: String(application.lastName || ''),
            phone: application.phone ? String(application.phone) : null,
            username,
            passwordHash,
          });

          const credentialCreated = credentialRows.length === 0;
          if (credentialCreated) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "EmployeePortalCredential"
                ("userId","username","passwordHash","displayName","mustChangePassword","failedLoginAttempts","lockedUntil","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,TRUE,0,NULL,NOW(),NOW())`,
              user.id,
              username,
              passwordHash,
              displayName,
            );
          }

          const activeEmployments = await tx.$queryRawUnsafe<any[]>(
            `SELECT * FROM "Employment"
              WHERE "organizationId"=$1 AND "userId"=$2 AND "status"<>'TERMINATED'
              ORDER BY "primaryEmployment" DESC,"startsAt" FOR UPDATE`,
            auth.organizationId,
            user.id,
          );
          let employment = activeEmployments.find((row) => row.legalEntityId === access.legalEntityId);
          if (!employment) {
            const employmentId = randomUUID();
            const rows = await tx.$queryRawUnsafe<any[]>(
              `INSERT INTO "Employment"
                ("id","organizationId","userId","legalEntityId","departmentId","employeeNumber","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10,'ACCEPTED_APPLICATION',$11::jsonb)
               RETURNING *`,
              employmentId,
              auth.organizationId,
              user.id,
              access.legalEntityId,
              application.departmentId || null,
              input.employeeNumber ?? null,
              offer.positionTitle || application.appliedRole || null,
              employmentTypeFor(offer.employmentType),
              activeEmployments.length === 0,
              offer.startDate || new Date(),
              JSON.stringify({ applicationId, offerId: offer.id, roleCode: requestedRole, prelaunchTrainingAuthorized: true }),
            );
            employment = rows[0];
          }

          await tx.$executeRawUnsafe(
            `INSERT INTO "UserEntityAccessGrant"
              ("organizationId","userId","scopeType","legalEntityId","departmentId","roleCode","permissionKey","accessLevel","grantedById","reason","metadata")
             SELECT $1,$2,CASE WHEN $5::text IS NULL THEN 'LEGAL_ENTITY' ELSE 'DEPARTMENT' END,$3,$5,$4,'PORTAL_ACCESS','READ',$6,
                    'Employee access created from accepted application',$7::jsonb
             WHERE NOT EXISTS (
               SELECT 1 FROM "UserEntityAccessGrant"
                WHERE "organizationId"=$1 AND "userId"=$2 AND "active"=true
                  AND "permissionKey"='PORTAL_ACCESS'
                  AND ("legalEntityId"=$3 OR "departmentId"=$5)
             )`,
            auth.organizationId,
            user.id,
            access.legalEntityId,
            requestedRole,
            application.departmentId || null,
            auth.userId,
            JSON.stringify({ applicationId, offerId: offer.id, source: 'ACCEPTED_APPLICATION' }),
          );

          const dueDate = input.trainingDueDate || new Date(Date.now() + 14 * 86_400_000);
          const courses = input.assignInitialTraining
            ? trainingCourses(String(application.legalEntityCode), requestedRole, input.courseCodes)
            : [];
          let trainingAssignmentCount = 0;
          for (const course of courses) {
            const inserted = await tx.$executeRawUnsafe(
              `INSERT INTO "EducationAssignment"
                ("id","organizationId","legalEntityId","departmentId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","createdAt","updatedAt")
               SELECT $1,$2,$3,$4,$5,$6,$7,'INITIAL','ASSIGNED',$8,'Initial company onboarding and role training',$9,NOW(),NOW(),NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM "EducationAssignment"
                  WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "employeeId"=$5 AND "courseCode"=$6
                    AND "status" IN ('ASSIGNED','IN_PROGRESS')
               )`,
              randomUUID(),
              auth.organizationId,
              access.legalEntityId,
              application.departmentId || null,
              user.id,
              course.code,
              course.title,
              dueDate,
              auth.userId,
            );
            trainingAssignmentCount += inserted;
          }

          const [history, interviews, messages] = await Promise.all([
            tx.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantStatusHistory" WHERE "applicationId"=$1 ORDER BY "createdAt"`, applicationId),
            tx.$queryRawUnsafe<any[]>(`SELECT * FROM "InterviewAppointment" WHERE "applicationId"=$1 ORDER BY "createdAt"`, applicationId).catch(() => []),
            tx.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantMessage" WHERE "applicationId"=$1 ORDER BY "createdAt"`, applicationId),
          ]);
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmployeeOnboardingLink"
              ("id","organizationId","legalEntityId","departmentId","applicationId","employeeId","linkedById","reason")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'Employee provisioned from signed and accepted offer')
             ON CONFLICT ("organizationId","applicationId") DO UPDATE SET
               "legalEntityId"=EXCLUDED."legalEntityId","departmentId"=EXCLUDED."departmentId","employeeId"=EXCLUDED."employeeId",
               "linkedById"=EXCLUDED."linkedById","reason"=EXCLUDED."reason","linkedAt"=NOW()`,
            randomUUID(), auth.organizationId, access.legalEntityId, application.departmentId || null,
            applicationId, user.id, auth.userId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeSecureDocument" secure_document
                SET "legalEntityId"=$1,"updatedAt"=NOW()
              WHERE secure_document."organizationId"=$2 AND secure_document."employeeId"=$3
                AND secure_document."sourceType"='APPLICANT' AND secure_document."legalEntityId" IS NULL
                AND secure_document."sourceId" IN (
                  SELECT document."id" FROM "ApplicantDocument" document WHERE document."applicationId"=$4
                )`,
            access.legalEntityId,
            auth.organizationId,
            user.id,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmployeeOnboardingSnapshot"
              ("id","organizationId","legalEntityId","departmentId","applicationId","employeeId","applicationData","assessmentData","statusHistory","interviews","messages")
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)
             ON CONFLICT ("organizationId","applicationId") DO UPDATE SET
               "legalEntityId"=EXCLUDED."legalEntityId","departmentId"=EXCLUDED."departmentId","employeeId"=EXCLUDED."employeeId",
               "applicationData"=EXCLUDED."applicationData","assessmentData"=EXCLUDED."assessmentData",
               "statusHistory"=EXCLUDED."statusHistory","interviews"=EXCLUDED."interviews","messages"=EXCLUDED."messages","updatedAt"=NOW()`,
            randomUUID(), auth.organizationId, access.legalEntityId, application.departmentId || null, applicationId, user.id,
            JSON.stringify(application.applicationData || application), JSON.stringify(application.assessmentAnswers || null),
            JSON.stringify(history), JSON.stringify(interviews), JSON.stringify(messages),
          );

          await tx.$executeRawUnsafe(
            `UPDATE "EmploymentOffer" SET "employeeId"=$1,"status"='EMPLOYEE_CREATED',"updatedAt"=NOW() WHERE "id"=$2`,
            user.id,
            offer.id,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication" SET "workflowStatus"='HIRED',"updatedAt"=NOW() WHERE "id"=$1`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             SELECT $1,$2,$3,'HIRED',$4,TRUE,$5,NOW()
             WHERE NOT EXISTS (SELECT 1 FROM "ApplicantStatusHistory" WHERE "applicationId"=$2 AND "toStatus"='HIRED')`,
            randomUUID(),
            applicationId,
            application.workflowStatus || 'OFFER_ACCEPTED',
            `Employee profile, company access, and ${trainingAssignmentCount} training assignment(s) created.`,
            auth.userId,
          );

          const provisioningId = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmployeeHireProvisioning"
              ("id","organizationId","legalEntityId","departmentId","applicationId","offerId","userId","employmentId","provisionedById","roleCode","trainingAssignmentCount","credentialCreated","welcomeDeliveryStatus","metadata")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
            provisioningId,
            auth.organizationId,
            access.legalEntityId,
            application.departmentId || null,
            applicationId,
            offer.id,
            user.id,
            employment.id,
            auth.userId,
            requestedRole,
            trainingAssignmentCount,
            credentialCreated,
            input.sendWelcomeEmail ? 'PENDING' : 'NOT_REQUESTED',
            JSON.stringify({ legalEntityCode: application.legalEntityCode, username, displayName, dueDate }),
          );
          return {
            id: provisioningId,
            duplicate: false,
            applicationId,
            offerId: offer.id,
            userId: user.id,
            employmentId: employment.id,
            legalEntityId: access.legalEntityId,
            legalEntityName: application.legalEntityName,
            departmentId: application.departmentId || null,
            departmentName: application.departmentName || null,
            roleCode: requestedRole,
            username,
            displayName,
            email,
            trainingAssignmentCount,
            trainingDueDate: dueDate,
            credentialCreated,
            temporaryPassword: credentialCreated ? requestedPassword : null,
            welcomeDeliveryStatus: input.sendWelcomeEmail ? 'PENDING' : 'NOT_REQUESTED',
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        if (result.duplicate) return void res.json({ data: result, duplicate: true });

        let delivery = { status: 'NOT_REQUESTED' as 'SENT' | 'FAILED' | 'NOT_REQUESTED' | 'NOT_CONFIGURED', error: null as string | null };
        if (input.sendWelcomeEmail) {
          delivery = await sendWelcome(
            String(result.legalEntityName),
            String(result.email),
            String(result.displayName),
            String(result.username),
            result.temporaryPassword ? String(result.temporaryPassword) : null,
            Number(result.trainingAssignmentCount),
          );
          await prisma.$executeRawUnsafe(
            `UPDATE "EmployeeHireProvisioning"
                SET "welcomeDeliveryStatus"=$1,
                    "metadata"="metadata" || jsonb_build_object('welcomeDeliveryError',$2::text),
                    "updatedAt"=NOW()
              WHERE "id"=$3`,
            delivery.status,
            delivery.error,
            result.id,
          );
        }

        await audit(auth, 'PROVISION_EMPLOYEE_FROM_ACCEPTED_APPLICATION', 'EmployeeHireProvisioning', String(result.id), {
          applicationId,
          userId: result.userId,
          employmentId: result.employmentId,
          legalEntityId: result.legalEntityId,
          departmentId: result.departmentId,
          roleCode: result.roleCode,
          trainingAssignmentCount: result.trainingAssignmentCount,
          credentialCreated: result.credentialCreated,
          welcomeDeliveryStatus: delivery.status,
        });
        res.status(201).json({ data: { ...result, welcomeDeliveryStatus: delivery.status, welcomeDeliveryError: delivery.error } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/admin/applications/:id/hire/access-reset',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.DOO, UserRole.HR_MANAGER),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        if (!access.capabilities.includes('ONBOARDING')) {
          return void res.status(409).json({ error: `Onboarding is not enabled for ${access.legalEntityName}` });
        }
        const input = accessResetSchema.parse(req.body);
        const applicationId = String(req.params.id);
        const password = temporaryPassword();
        const passwordHash = hashPortalPassword(password);
        const result = await prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRawUnsafe<any[]>(
            `SELECT provisioning."id" AS "provisioningId",provisioning."userId",provisioning."trainingAssignmentCount",
                    provisioning."legalEntityId",provisioning."departmentId",provisioning."roleCode",
                    application."email",application."firstName",application."middleName",application."lastName",
                    entity."displayName" AS "legalEntityName",credential."username",user_row."role"::text AS "userRole",
                    EXISTS (
                      SELECT 1 FROM "Employment" other_employment
                       WHERE other_employment."organizationId"=provisioning."organizationId"
                         AND other_employment."userId"=provisioning."userId"
                         AND other_employment."status"<>'TERMINATED'
                         AND other_employment."legalEntityId"<>provisioning."legalEntityId"
                    ) OR EXISTS (
                      SELECT 1 FROM "UserEntityAccessGrant" other_grant
                       WHERE other_grant."organizationId"=provisioning."organizationId"
                         AND other_grant."userId"=provisioning."userId" AND other_grant."active"=true
                         AND other_grant."effectiveFrom"<=NOW() AND (other_grant."effectiveTo" IS NULL OR other_grant."effectiveTo">NOW())
                         AND (
                           other_grant."scopeType"='ENTERPRISE'
                           OR (other_grant."legalEntityId" IS NOT NULL AND other_grant."legalEntityId"<>provisioning."legalEntityId")
                           OR EXISTS (
                             SELECT 1 FROM "Department" other_department
                              WHERE other_department."id"=other_grant."departmentId"
                                AND other_department."legalEntityId"<>provisioning."legalEntityId"
                           )
                         )
                    ) AS "hasCrossCompanyAccess"
               FROM "EmployeeHireProvisioning" provisioning
               JOIN "EmployeeApplication" application ON application."organizationId"=provisioning."organizationId" AND application."id"=provisioning."applicationId"
               JOIN "LegalEntity" entity ON entity."organizationId"=provisioning."organizationId" AND entity."id"=provisioning."legalEntityId"
               JOIN "User" user_row ON user_row."organizationId"=provisioning."organizationId" AND user_row."id"=provisioning."userId"
               LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=provisioning."userId"
              WHERE provisioning."organizationId"=$1 AND provisioning."applicationId"=$2 AND provisioning."legalEntityId"=$3
              LIMIT 1 FOR UPDATE OF provisioning`,
            auth.organizationId,
            applicationId,
            access.legalEntityId,
          );
          const employee = rows[0];
          if (!employee) throw Object.assign(new Error('A provisioned employee was not found for this application and company'), { status: 404 });
          if (!employee.username) throw Object.assign(new Error('The employee portal credential is missing and requires security administration'), { status: 409 });
          if ((employee.hasCrossCompanyAccess || privilegedRoles.has(employee.userRole as UserRole)) && !access.enterpriseOwner) {
            throw Object.assign(new Error('Only the Enterprise Owner may reset access for a cross-company or privileged employee'), { status: 403 });
          }
          const updated = await tx.$executeRawUnsafe(
            `UPDATE "EmployeePortalCredential" SET "passwordHash"=$1,"mustChangePassword"=TRUE,
                    "failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=NOW()
              WHERE "userId"=$2`,
            passwordHash,
            employee.userId,
          );
          if (updated !== 1) throw Object.assign(new Error('The employee portal credential could not be reset'), { status: 409 });
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeAuthSession" SET "revokedAt"=NOW(),"revokedById"=$1,
                    "revocationReason"='Portal access reset from accepted application'
              WHERE "organizationId"=$2 AND "userId"=$3 AND "revokedAt" IS NULL`,
            auth.userId,
            auth.organizationId,
            employee.userId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeHireProvisioning" SET
                    "welcomeDeliveryStatus"=$1,
                    "metadata"="metadata" || jsonb_build_object(
                      'lastAccessResetAt',NOW(),'lastAccessResetById',$2::text,'lastAccessResetDeliveryStatus',$1::text
                    ),"updatedAt"=NOW()
              WHERE "id"=$3`,
            input.sendWelcomeEmail ? 'PENDING' : 'NOT_REQUESTED',
            auth.userId,
            employee.provisioningId,
          );
          return {
            ...employee,
            displayName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' '),
            email: normalizeEmail(employee.email),
            temporaryPassword: password,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        let delivery = { status: 'NOT_REQUESTED' as 'SENT' | 'FAILED' | 'NOT_REQUESTED' | 'NOT_CONFIGURED', error: null as string | null };
        if (input.sendWelcomeEmail) {
          delivery = await sendWelcome(
            String(result.legalEntityName),
            String(result.email),
            String(result.displayName),
            String(result.username),
            password,
            Number(result.trainingAssignmentCount),
            true,
          );
          await prisma.$executeRawUnsafe(
            `UPDATE "EmployeeHireProvisioning" SET "welcomeDeliveryStatus"=$1,
                    "metadata"="metadata" || jsonb_build_object(
                      'lastAccessResetDeliveryStatus',$1::text,'lastAccessResetDeliveryError',$2::text
                    ),"updatedAt"=NOW()
              WHERE "id"=$3`,
            delivery.status,
            delivery.error,
            result.provisioningId,
          );
        }
        await audit(auth, 'RESET_HIRED_EMPLOYEE_PORTAL_ACCESS', 'EmployeeHireProvisioning', String(result.provisioningId), {
          applicationId,
          userId: result.userId,
          legalEntityId: result.legalEntityId,
          crossCompanyAccess: Boolean(result.hasCrossCompanyAccess),
          sessionsRevoked: true,
          welcomeDeliveryStatus: delivery.status,
        });
        res.status(201).json({ data: {
          applicationId,
          userId: result.userId,
          legalEntityId: result.legalEntityId,
          legalEntityName: result.legalEntityName,
          username: result.username,
          temporaryPassword: password,
          mustChangePassword: true,
          sessionsRevoked: true,
          welcomeDeliveryStatus: delivery.status,
          welcomeDeliveryError: delivery.error,
        } });
      } catch (error) {
        next(error);
      }
    },
  );
}
