import { randomBytes, randomUUID } from 'node:crypto';
import type express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const consultationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  service: z.enum([
    'Community living support',
    'Personalized in-home care',
    'Transportation',
    'Respite or caregiver support',
    'Employment inquiry',
    'Other',
  ]),
  message: z.string().trim().max(1000).optional(),
}).strict();

function consultationReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `CONS-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function registerConsultationRoutes(app: express.Express, prisma: PrismaClient) {
  app.post('/public/consultations', async (req, res, next) => {
    try {
      const input = consultationSchema.parse(req.body);
      const id = randomUUID();
      const referenceNumber = consultationReference();
      const organizationId = process.env.CAREERS_ORGANIZATION_ID?.trim() || null;

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ConsultationRequest"
          ("id", "organizationId", "referenceNumber", "name", "phone", "email",
           "service", "message", "status", "ipAddress", "userAgent", "createdAt", "updatedAt")
        VALUES
          (${id}, ${organizationId}, ${referenceNumber}, ${input.name}, ${input.phone},
           ${input.email || null}, ${input.service}, ${input.message || null}, 'NEW',
           ${req.ip || req.socket.remoteAddress || null}, ${req.get('user-agent')?.slice(0, 500) || null},
           NOW(), NOW())
      `);

      res.status(201).json({ data: { referenceNumber } });
    } catch (error) {
      next(error);
    }
  });
}
