import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { putSecureObject, scanBufferForMalware } from './secure-object-storage.js';
import { probeITCodingWorker, runApprovedITCodingWorker } from './it-coding-worker.js';
import { getITSpecialistKnowledgeContext } from './it-specialist-knowledge.js';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');
