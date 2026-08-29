import { randomUUID } from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
import { createTransport } from 'nodemailer';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type AuditFn = (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => Promise<void>;

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
  audit?: AuditFn;
};

type RequirementType = 'DOCUMENT' | 'EDUCATION' | 'ATTESTATION' | 'MANUAL';
type ComplianceStatus = 'NOT_STARTED' | 'MISSING' | 'IN_PROGRESS' | 'DUE_SOON' | 'OVERDUE' | 'COMPLIANT' | 'EXEMPT' | 'NOT_APPLICABLE';
type RecipientType = 'EMPLOYEE' | 'SUPERVISOR' | 'LOCATION_MANAGER' | 'HR';
type RunTrigger = 'MANUAL' | 'SCHEDULED' | 'STARTUP';

type RequirementRow = {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string | null;
  requirementType: RequirementType;
  documentCategory: string | null;
  documentTitleContains: string | null;
  documentSensitivity: string;
  courseCode: string | null;
  courseTitle: string | null;
  attestationText: string | null;
  requiredForAll: boolean;
  appliesToRoles: unknown;
  appliesToDepartments: unknown;
  appliesToJobTitles: unknown;
  appliesToLocationIds: unknown;
  employmentStatuses: unknown;
  dueDaysAfterHire: number;
  renewalDays: number | null;
  warningWindowDays: number;
  reminderDays: unknown;
  managerEscalationDays: unknown;
  hrEscalationDays: unknown;
  notifyEmployee: boolean;
  notifySupervisor: boolean;
  notifyLocationManager: boolean;
  notifyHR: boolean;
  autoAssignEducation: boolean;
  allowEmployeeUpload: boolean;
  allowEmployeeAttestation: boolean;
  active: boolean;
  createdById: string;
  updatedById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type EmployeeRow = {
  id: string;
  email: string | null;
  role: string;
  displayName: string;
  department: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  hireDate: Date | string | null;
  supervisorId: string | null;
  locationIds: string[];
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  requirementId: string;
  employeeId: string;
  status: ComplianceStatus;
  source: string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  expiresAt: Date | string | null;
  evidenceType: string | null;
  evidenceId: string | null;
  evidenceSummary: string | null;
  exemptReason: string | null;
  exemptUntil: Date | string | null;
  manuallyCompletedAt: Date | string | null;
  manualNotes: string | null;
  lastEvaluatedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const PORTAL_URL = 'https://www.sulandrahealth.com/employee-portal.html#myCompliance';
const EDUCATION_URL = 'https://www.sulandrahealth.com/education-portal.html';
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DAY_MS = 86_400_000;
const DEFAULT_REMINDER_DAYS = [60, 30, 14, 7, 1, 0, -1, -7, -14, -30];
const DEFAULT_MANAGER_ESCALATION_DAYS = [-1, -7, -14, -30];
const DEFAULT_HR_ESCALATION_DAYS = [-7, -14, -30];
const SENSITIVITIES = ['GENERAL', 'HR_CONFIDENTIAL', 'MEDICAL', 'BACKGROUND', 'DISCIPLINARY', 'IDENTITY', 'COMPENSATION'] as const;

const managerRoles = [UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.HOUSE_MANAGER,UserRole.AUDITOR,UserRole.DELEGATING_NURSE,UserRole.CEO,UserRole.COO] as const;
const globalRoles = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.AUDITOR,UserRole.CEO,UserRole.COO]);
const locationRoles = new Set<UserRole>([UserRole.PROGRAM_MANAGER,UserRole.HOUSE_MANAGER,UserRole.DELEGATING_NURSE]);
const requirementManagers = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER]);
const reminderSenders = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.PROGRAM_MANAGER,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.COO]);

const requirementSchema = z.object({ code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letters, numbers, periods, underscores, or hyphens'), title: z.string().trim().min(2).max(240), description: z.string().trim().max(4_000).optional().nullable(), requirementType: z.enum(['DOCUMENT', 'EDUCATION', 'ATTESTATION', 'MANUAL']), documentCategory: z.string().trim().max(120).optional().nullable(), documentTitleContains: z.string().trim().max(200).optional().nullable(), documentSensitivity: z.enum(SENSITIVITIES).optional().default('GENERAL'), courseCode: z.string().trim().max(120).optional().nullable(), courseTitle: z.string().trim().max(300).optional().nullable(), attestationText: z.string().trim().max(10_000).optional().nullable(), requiredForAll: z.boolean().optional().default(false), appliesToRoles: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]), appliesToDepartments: z.array(z.string().trim().min(1).max(160)).max(100).optional().default([]), appliesToJobTitles: z.array(z.string().trim().min(1).max(160)).max(100).optional().default([]), appliesToLocationIds: z.array(z.string().trim().min(1).max(200)).max(500).optional().default([]), employmentStatuses: z.array(z.enum(['ACTIVE', 'LEAVE', 'SUSPENDED', 'TERMINATED'])).min(1).max(4).optional().default(['ACTIVE']), dueDaysAfterHire: z.number().int().min(0).max(3_650).optional().default(30), renewalDays: z.number().int().min(1).max(3_650).optional().nullable(), warningWindowDays: z.number().int().min(1).max(365).optional().default(60), reminderDays: z.array(z.number().int().min(-3_650).max(3_650)).max(50).optional().default(DEFAULT_REMINDER_DAYS), managerEscalationDays: z.array(z.number().int().min(-3_650).max(0)).max(50).optional().default(DEFAULT_MANAGER_ESCALATION_DAYS), hrEscalationDays: z.array(z.number().int().min(-3_650).max(0)).max(50).optional().default(DEFAULT_HR_ESCALATION_DAYS), notifyEmployee: z.boolean().optional().default(true), notifySupervisor: z.boolean().optional().default(true), notifyLocationManager: z.boolean().optional().default(true), notifyHR: z.boolean().optional().default(true), autoAssignEducation: z.boolean().optional().default(true), allowEmployeeUpload: z.boolean().optional().default(true), allowEmployeeAttestation: z.boolean().optional().default(true), active: z.boolean().optional().default(true),}).superRefine((value, context) => {
  if (!value.requiredForAll && value.appliesToRoles.length === 0 && value.appliesToDepartments.length === 0 && value.appliesToJobTitles.length === 0 && value.appliesToLocationIds.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredForAll'], message: 'Choose Required for all or add at least one applicability filter' });
  if (value.requirementType === 'DOCUMENT' && !value.documentCategory) context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentCategory'], message: 'Document requirements need a document category' });
  if (value.requirementType === 'EDUCATION' && !value.courseCode) context.addIssue({ code: z.ZodIssueCode.custom, path: ['courseCode'], message: 'Education requirements need a course code' });
  if (value.requirementType === 'ATTESTATION' && !value.attestationText) context.addIssue({ code: z.ZodIssueCode.custom, path: ['attestationText'], message: 'Attestation requirements need an attestation statement' });
});

const settingsSchema = z.object({ enabled: z.boolean().optional().default(true), timezone: z.string().trim().min(1).max(100).optional().default('America/New_York'), scanHour: z.number().int().min(0).max(23).optional().default(8), hrRecipients: z.array(z.string().trim().email()).max(50).optional().default([]), portalUrl: z.string().trim().url().max(500).optional().default(PORTAL_URL), senderName: z.string().trim().min(2).max(160).optional().default('Sulandra Health Human Resources Department'), });

const assignmentOverrideSchema = z.object({ action: z.enum(['EXEMPT', 'CLEAR_EXEMPTION', 'MARK_COMPLETE', 'RESET', 'CHANGE_DUE_DATE']), reason: z.string().trim().max(4_000).optional().nullable(), exemptUntil: z.coerce.date().optional().nullable(), dueDate: z.coerce.date().optional().nullable(), });
const attestationSchema = z.object({ typedName: z.string().trim().min(2).max(200), accepted: z.literal(true), });
const uploadSchema = z.object({ fileName: z.string().trim().min(1).max(300), mimeType: z.string().trim().min(1).max(180), contentBase64: z.string().min(1).max(25_000_000), issueDate: z.coerce.date().optional().nullable(), expirationDate: z.coerce.date().optional().nullable(), notes: z.string().trim().max(4_000).optional().default('Submitted by employee for compliance review'), });
const dashboardQuerySchema = z.object({ status: z.string().trim().optional(), requirementId: z.string().trim().optional(), locationId: z.string().trim().optional(), q: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(5_000).default(1_000), });
const logQuerySchema = z.object({ employeeId: z.string().trim().optional(), requirementId: z.string().trim().optional(), status: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(1_000).default(250), });

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const cleanFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'employee-document';
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const asNumberArray = (value: unknown, fallback: number[]): number[] => { if (!Array.isArray(value)) return fallback; return [...new Set(value.map(Number).filter(Number.isFinite).map(Math.trunc))].sort((a, b) => b - a); };
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : null;
const startOfToday = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); };
const addDays = (value: Date | string, days: number) => new Date(new Date(value).getTime() + days * DAY_MS);
const daysUntil = (value: Date | string | null | undefined) => { if (!value) return null; const target = new Date(`${dateOnly(value)}T00:00:00.000Z`); return Math.round((target.getTime() - startOfToday().getTime()) / DAY_MS); };
const ownerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const uniqueEmails = (values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(normalizeEmail).filter(Boolean))];

export function registerEmployeeComplianceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) { /* unchanged body for brevity in this patch context */ }
