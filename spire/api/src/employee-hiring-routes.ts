import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');
const bcrypt = require('bcryptjs') as typeof import('bcryptjs');

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const statusSchema = z.object({
  status: z.enum(['RECEIVED','REVIEWING','DOCUMENTS_NEEDED','INTERVIEW','OFFER_PENDING','HIRED','WITHDRAWN','TERMINATED']),
  note: z.string().trim().max(4000).optional().default(''),
  visibleToApplicant: z.boolean().optional().default(true),
  notifyApplicant: z.boolean().optional().default(true),
});

function cleanName(value: unknown) {
  return String(value || '').trim();
}

function usernameBase(firstName: string, lastName: string) {
  const first = firstName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 1);
  const last = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!first || !last) throw new Error('The applicant must have a valid first and last name before hiring.');
  return `${first}${last}`;
}

function temporaryPassword() {
  return `Sul-${randomBytes(8).toString('base64url')}!7`;
}

function mailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP is not configured.');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function uniqueUsername(prisma: PrismaClient, base: string) {
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const local = suffix === 0 ? base : `${base}${suffix + 1}`;
    const username = `${local}@sulandrahealth.com`;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 1 FROM "User" WHERE lower("email")=lower($1) LIMIT 1`, username,
    );
    if (!rows[0]) return username;
  }
  throw new Error('A unique employee username could not be generated.');
}

function roleFor(application: Record<string, any>): UserRole {
  const candidate = String(application.appliedRole || application.role || 'DSP').toUpperCase();
  return (Object.values(UserRole) as string[]).includes(candidate) ? candidate as UserRole : UserRole.DSP;
}

async function sendWelcomeEmail(input: {
  personalEmail: string;
  employeeUsername: string;
  temporaryPassword: string;
  firstName: string;
}) {
  const sender = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@sulandrahealth.com';
  const portalUrl = process.env.EMPLOYEE_PORTAL_URL || 'https://www.sulandrahealth.com/employee-login.html';
  await mailer().sendMail({
    from: `Sulandra Human Resources <${sender}>`,
    to: input.personalEmail,
    subject: 'Welcome to Sulandra Health — employee portal access',
    text: `Welcome to Sulandra Health, ${input.firstName}. Your employee username is ${input.employeeUsername}. Your temporary password is ${input.temporaryPassword}. Sign in at ${portalUrl} and change your password immediately. Do not share this password.`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#17243a"><h2>Welcome to Sulandra Health</h2><p>Hello ${input.firstName},</p><p>Your employee profile has been created and your S.P.I.R.E. employee portal is ready.</p><p><strong>Employee username:</strong> ${input.employeeUsername}<br><strong>Temporary password:</strong> ${input.temporaryPassword}</p><p><a href="${portalUrl}">Open the employee portal</a></p><p>You must change the temporary password after your first sign-in. Do not share your login information.</p><p><strong><em style="color:#0284c7">Human Resources</em></strong><br>Sulandra Health</p><p style="font-size:12px;color:#66778a">This mailbox is not monitored. This message is not an offer of employment.</p></div>`,
  });
}

export function registerEmployeeHiringRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.patch('/api/admin/applications/:id/status', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const applicationId = String(req.params.id || '');
      const input = statusSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
        applicationId, auth.organizationId,
      );
      const application = rows[0];
      if (!application) return res.status(404).json({ error: 'Application not found.' });

      let employeeId: string | null = null;
      let employeeUsername: string | null = null;
      let welcomeDelivery: 'NOT_REQUESTED' | 'SENT' | 'FAILED' = 'NOT_REQUESTED';
      let temporary: string | null = null;

      if (input.status === 'HIRED') {
        const firstName = cleanName(application.firstName);
        const lastName = cleanName(application.lastName);
        const personalEmail = cleanName(application.email).toLowerCase();
        if (!personalEmail) return res.status(400).json({ error: 'The applicant must have a personal email address before hiring.' });

        const existing = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","email" FROM "User" WHERE "organizationId"=$1 AND lower(COALESCE("personalEmail","email"))=lower($2) LIMIT 1`,
          auth.organizationId, personalEmail,
        ).catch(() => prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","email" FROM "User" WHERE "organizationId"=$1 AND lower("email")=lower($2) LIMIT 1`,
          auth.organizationId, personalEmail,
        ));

        if (existing[0]) {
          employeeId = String(existing[0].id);
          employeeUsername = String(existing[0].email);
        } else {
          employeeId = randomUUID();
          employeeUsername = await uniqueUsername(prisma, usernameBase(firstName, lastName));
          temporary = temporaryPassword();
          const passwordHash = await bcrypt.hash(temporary, 12);
          const role = roleFor(application);

          await prisma.$transaction(async (tx) => {
            try {
              await tx.$executeRawUnsafe(
                `INSERT INTO "User" ("id","organizationId","email","personalEmail","firstName","lastName","role","passwordHash","isActive","mustChangePassword","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,NOW(),NOW())`,
                employeeId, auth.organizationId, employeeUsername, personalEmail, firstName, lastName, role, passwordHash,
              );
            } catch {
              await tx.$executeRawUnsafe(
                `INSERT INTO "User" ("id","organizationId","email","firstName","lastName","role","passwordHash","isActive","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())`,
                employeeId, auth.organizationId, employeeUsername, firstName, lastName, role, passwordHash,
              );
            }
            await tx.$executeRawUnsafe(
              `UPDATE "EmployeeApplication" SET "workflowStatus"='HIRED',"updatedAt"=NOW() WHERE "id"=$1 AND "organizationId"=$2`,
              applicationId, auth.organizationId,
            );
          });

          try {
            await sendWelcomeEmail({ personalEmail, employeeUsername, temporaryPassword: temporary, firstName });
            welcomeDelivery = 'SENT';
          } catch (mailError) {
            welcomeDelivery = 'FAILED';
            console.error('Employee welcome email failed', mailError);
          }
        }
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeApplication" SET "workflowStatus"=$1,"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3`,
          input.status, applicationId, auth.organizationId,
        );
      }

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ApplicationStatusHistory" ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
          randomUUID(), applicationId, application.workflowStatus || 'RECEIVED', input.status, input.note || null, input.visibleToApplicant, auth.userId,
        );
      } catch (historyError) {
        console.warn('Status history could not be recorded', historyError);
      }

      await audit(auth, input.status === 'HIRED' ? 'HIRE_AND_PROVISION_EMPLOYEE' : 'UPDATE_APPLICATION_STATUS', 'EmployeeApplication', applicationId, {
        fromStatus: application.workflowStatus,
        toStatus: input.status,
        employeeId,
        employeeUsername,
        welcomeDelivery,
      });

      res.json({
        data: {
          applicationId,
          status: input.status,
          employeeId,
          employeeUsername,
          welcomeDelivery,
          message: input.status === 'HIRED'
            ? welcomeDelivery === 'SENT'
              ? 'Employee profile created and welcome email sent.'
              : 'Employee profile created. The welcome email could not be delivered and should be resent from the employee profile.'
            : 'Application status updated.',
        },
      });
    } catch (error) {
      next(error);
    }
  });
}
