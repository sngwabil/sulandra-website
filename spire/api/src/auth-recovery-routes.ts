import type express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

const forgotPasswordSchema = z.object({
  username: z.string().trim().email().max(254),
});

const forgotUsernameSchema = z.object({
  email: z.string().trim().email().max(254),
});

type AttemptBucket = { count: number; resetAt: number };

const attempts = new Map<string, AttemptBucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_BUCKETS = 10_000;
const GENERIC_MESSAGE = 'If the information matches an active employee account, recovery instructions have been sent.';

function cleanupAttempts(now: number) {
  for (const [key, bucket] of attempts) {
    if (bucket.resetAt <= now) attempts.delete(key);
  }
  if (attempts.size <= MAX_BUCKETS) return;
  const oldest = [...attempts.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, attempts.size - MAX_BUCKETS);
  oldest.forEach(([key]) => attempts.delete(key));
}

function clientKey(request: express.Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return firstForwarded?.trim() || request.ip || request.socket.remoteAddress || 'unknown';
}

function rateLimit(request: express.Request) {
  const now = Date.now();
  cleanupAttempts(now);
  const key = clientKey(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

function transporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP is not configured.');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function value(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function employeeUsername(row: Record<string, unknown>) {
  const existing = value(row, 'username', 'employeeUsername', 'employeeEmail', 'email');
  if (existing.toLowerCase().endsWith('@sulandrahealth.com')) return existing.toLowerCase();
  const firstName = value(row, 'firstName', 'givenName');
  const lastName = value(row, 'lastName', 'familyName', 'surname');
  if (!firstName || !lastName) return existing.toLowerCase();
  const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${firstName[0].toLowerCase()}${cleanLast}@sulandrahealth.com`;
}

async function findByUsername(prisma: PrismaClient, username: string) {
  const rows = await prisma.$queryRaw<Array<{ data: Record<string, unknown> }>>(Prisma.sql`
    SELECT to_jsonb(u) AS data
      FROM "User" u
     WHERE lower(COALESCE(to_jsonb(u)->>'username', to_jsonb(u)->>'employeeUsername', to_jsonb(u)->>'employeeEmail', to_jsonb(u)->>'email', '')) = lower(${username})
       AND COALESCE(to_jsonb(u)->>'isActive', 'true') <> 'false'
     LIMIT 1
  `);
  return rows[0]?.data || null;
}

async function findByRecoveryEmail(prisma: PrismaClient, email: string) {
  const rows = await prisma.$queryRaw<Array<{ data: Record<string, unknown> }>>(Prisma.sql`
    SELECT to_jsonb(u) AS data
      FROM "User" u
     WHERE lower(${email}) IN (
       lower(COALESCE(to_jsonb(u)->>'personalEmail', '')),
       lower(COALESCE(to_jsonb(u)->>'email', '')),
       lower(COALESCE(to_jsonb(u)->>'employeeEmail', ''))
     )
       AND COALESCE(to_jsonb(u)->>'isActive', 'true') <> 'false'
     LIMIT 1
  `);
  return rows[0]?.data || null;
}

async function sendMail(to: string[], subject: string, html: string, text: string) {
  const unique = [...new Set(to.map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return;
  const sender = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@sulandrahealth.com';
  await transporter().sendMail({
    from: `Sulandra HR <${sender}>`,
    to: unique,
    subject,
    text,
    html,
  });
}

export function registerAuthRecoveryRoutes(app: express.Express, prisma: PrismaClient) {
  app.post('/api/auth/forgot-password', async (req, res, next) => {
    try {
      if (rateLimit(req)) return res.status(429).json({ error: 'Too many recovery attempts. Please wait 15 minutes and try again.' });
      const { username } = forgotPasswordSchema.parse(req.body);
      const user = await findByUsername(prisma, username);
      if (user) {
        const personalEmail = value(user, 'personalEmail', 'recoveryEmail');
        const employeeEmail = value(user, 'employeeEmail', 'username', 'email');
        const resetReference = randomBytes(12).toString('hex').toUpperCase();
        const recipients = [personalEmail, employeeEmail];
        const text = `A password recovery request was received for ${employeeUsername(user)}. For security, Sulandra never emails an existing password. Contact Human Resources and provide recovery reference ${resetReference} to receive a temporary password or secure reset link. If you did not request this, contact Human Resources immediately.`;
        await sendMail(
          recipients,
          'S.P.I.R.E. password recovery request',
          `<p>A password recovery request was received for <strong>${employeeUsername(user)}</strong>.</p><p>For security, Sulandra never emails an existing password. Contact Human Resources and provide recovery reference <strong>${resetReference}</strong> to receive a temporary password or secure reset link.</p><p>If you did not request this, contact Human Resources immediately.</p><p><strong>Human Resources</strong><br>Sulandra Health</p>`,
          text,
        );
      }
      res.json({ message: GENERIC_MESSAGE });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/forgot-username', async (req, res, next) => {
    try {
      if (rateLimit(req)) return res.status(429).json({ error: 'Too many recovery attempts. Please wait 15 minutes and try again.' });
      const { email } = forgotUsernameSchema.parse(req.body);
      const user = await findByRecoveryEmail(prisma, email);
      if (user) {
        const username = employeeUsername(user);
        const personalEmail = value(user, 'personalEmail', 'recoveryEmail');
        const employeeEmail = value(user, 'employeeEmail', 'username', 'email');
        await sendMail(
          [personalEmail, employeeEmail],
          'Your S.P.I.R.E. employee username',
          `<p>Your Sulandra employee username is:</p><p style="font-size:18px"><strong>${username}</strong></p><p>Employee usernames use the first letter of the first name plus the full last name followed by <strong>@sulandrahealth.com</strong>.</p><p><strong>Human Resources</strong><br>Sulandra Health</p>`,
          `Your Sulandra employee username is ${username}. Employee usernames use the first letter of the first name plus the full last name followed by @sulandrahealth.com.`,
        );
      }
      res.json({ message: GENERIC_MESSAGE });
    } catch (error) {
      next(error);
    }
  });
}
