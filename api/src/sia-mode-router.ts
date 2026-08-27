export type SIAMode = 'GENERAL' | 'SULANDRA' | 'CLINICAL_SAFE';

export type SIARoutingInput = {
  message: string;
  page?: string | null;
  application?: string | null;
  hasAttachment?: boolean;
  recentMessages?: Array<{ role?: string; content: string }>;
};

export type SIARoutingDecision = {
  mode: SIAMode;
  modeLabel: string;
  modeDescription: string;
  reasonCodes: string[];
  clinicalPage: boolean;
  likelyProtectedData: boolean;
  containsSecret: boolean;
  blockBeforeModel: boolean;
  blockClinicalAttachment: boolean;
  allowLiveWebSearch: boolean;
};

export const SIA_MODE_METADATA: Record<SIAMode, { label: string; description: string }> = {
  GENERAL: {
    label: 'General',
    description: 'Broad knowledge, reasoning, writing, and current information when live web search is useful.',
  },
  SULANDRA: {
    label: 'Sulandra',
    description: 'Private, role-aware help with Sulandra applications, work, access, and troubleshooting.',
  },
  CLINICAL_SAFE: {
    label: 'Clinical-safe',
    description: 'Private clinical education and software guidance without patient-specific decisions or live web search.',
  },
};

const CLINICAL_PAGE_PATTERN = /(?:^|\/)(?:spire(?:\/|\.html|$)|e-?mar(?:\/|\.html|$)|tar(?:\/|\.html|$)|flowsheets?(?:\/|\.html|$)|client-station(?:\/|\.html|$)|patient(?:\/|\.html|$)|resident(?:\/|\.html|$)|clinical(?:\/|\.html|$)|chart(?:\/|\.html|$))/i;
const CLINICAL_APPLICATION_PATTERN = /\b(?:SPIRE|eMAR|MAR|TAR|flowsheet|client station|patient chart|resident chart|clinical chart)\b/i;
const CLINICAL_TOPIC_PATTERN = /\b(?:medication|medicine|drug|dose|dosage|diagnos(?:is|e)|symptom|treatment|therapy|wound|foley|catheter|oxygen|vital signs?|blood pressure|laborator(?:y|ies)|lab results?|mar|emar|e-mar|tar|care plan|clinical|patient|client care|resident care|sepsis|stroke|allergy|contraindication|side effect|infection|insulin|opioid|antibiotic|prescription|provider order|physician order|nursing assessment|triage|disease|illness|medical condition|pneumonia|diabetes|hypertension|cancer|asthma|copd|heart attack|influenza|flu|covid(?:-19)?)\b/i;
const SULANDRA_TOPIC_PATTERN = /\b(?:sulandra|employee portal|administrator portal|admin portal|admin sign[ -]?in|spire|scls|home health|nmt|my work|my workplace|work notification|open work|action items?|schedule|scheduled|shift|roster|employee 360|employee360|time(?:\s|&| and )attendance|payroll|benefits|intranet|education portal|this page|current page|this screen|current screen|help me do this|working on here|what should i do next|page (?:is )?(?:stuck|loading|spinning|blank|frozen)|stuck loading|still spinning|blank screen|black screen|sign[ -]?in|log[ -]?in|railway|github|deployment|production|support ticket|create (?:an? )?(?:it )?ticket)\b/i;
const GENERAL_EXPLICIT_PATTERN = /\b(?:who|what|when|where|why|how|explain|summarize|write|draft|compare|calculate|translate|brainstorm|today|current|latest|news|weather|history|science|math|coding|recipe|travel|capital of|meaning of)\b/i;
const AMBIGUOUS_FOLLOW_UP_PATTERN = /^(?:and|also|but|so|then|okay|ok|yes|no|why|how|when|where|which|what about|tell me more|continue|go on|next|that|it|this|those|them|same|again)\b[\s\S]{0,160}$/i;

const SECRET_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}\b/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session[_ -]?token|secret|password|private[_ -]?key|mfa[_ -]?code|recovery[_ -]?code)\s*(?:is|[:=])\s*["']?[^\s,;]{6,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const PROTECTED_DATA_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:mrn|medical record number|patient id|client id|resident id)\s*(?:is|[:#=-])?\s*[A-Z0-9][A-Z0-9-]{3,}\b/i,
  /\b(?:dob|date of birth)\s*(?:is|[:#=-])?\s*(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/i,
  /\b(?:[Pp]atient|[Cc]lient|[Rr]esident)\s+(?:named\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,2}\b/,
];

const normalizePage = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, 'https://sia.sulandra.invalid').pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] || '';
  }
};

const includesAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

const explicitModeFor = (text: string): SIAMode | null => {
  if (CLINICAL_TOPIC_PATTERN.test(text)) return 'CLINICAL_SAFE';
  if (SULANDRA_TOPIC_PATTERN.test(text)) return 'SULANDRA';
  if (GENERAL_EXPLICIT_PATTERN.test(text)) return 'GENERAL';
  return null;
};

const inheritedMode = (messages: Array<{ role?: string; content: string }> = []) => {
  for (let index = messages.length - 1; index >= Math.max(0, messages.length - 6); index -= 1) {
    const item = messages[index];
    if (item?.role && item.role !== 'user') continue;
    const mode = explicitModeFor(String(item?.content || ''));
    if (mode) return mode;
  }
  return null;
};

export const classifySiaMode = (input: SIARoutingInput): SIARoutingDecision => {
  const message = String(input.message || '').trim();
  const page = normalizePage(input.page);
  const application = String(input.application || '').trim();
  const sensitiveEvidence = `${message}\n${application}`;
  const containsSecret = includesAny(sensitiveEvidence, SECRET_PATTERNS);
  const likelyProtectedData = includesAny(sensitiveEvidence, PROTECTED_DATA_PATTERNS);
  const clinicalPage = CLINICAL_PAGE_PATTERN.test(page) || CLINICAL_APPLICATION_PATTERN.test(application);
  const blockClinicalAttachment = Boolean(input.hasAttachment && clinicalPage);
  const reasonCodes: string[] = [];

  if (containsSecret) reasonCodes.push('POSSIBLE_SECRET');
  if (likelyProtectedData) reasonCodes.push('POSSIBLE_PROTECTED_IDENTIFIER');
  if (clinicalPage) reasonCodes.push('CLINICAL_PAGE_CONTEXT');
  if (blockClinicalAttachment) reasonCodes.push('CLINICAL_PAGE_ATTACHMENT');

  let mode: SIAMode;
  const explicit = explicitModeFor(message);
  if (clinicalPage || likelyProtectedData || explicit === 'CLINICAL_SAFE') {
    mode = 'CLINICAL_SAFE';
    if (explicit === 'CLINICAL_SAFE') reasonCodes.push('CLINICAL_TOPIC');
  } else if (explicit === 'SULANDRA') {
    mode = 'SULANDRA';
    reasonCodes.push('SULANDRA_TOPIC');
  } else if (AMBIGUOUS_FOLLOW_UP_PATTERN.test(message)) {
    mode = inheritedMode(input.recentMessages) || 'GENERAL';
    reasonCodes.push(mode === 'GENERAL' ? 'GENERAL_FOLLOW_UP' : `${mode}_FOLLOW_UP`);
  } else if (explicit === 'GENERAL') {
    mode = 'GENERAL';
    reasonCodes.push('GENERAL_TOPIC');
  } else {
    mode = 'GENERAL';
    reasonCodes.push('GENERAL_DEFAULT');
  }

  const blockBeforeModel = containsSecret || likelyProtectedData || blockClinicalAttachment;
  if (input.hasAttachment && !blockClinicalAttachment) reasonCodes.push('ATTACHMENT_DISALLOWS_WEB');
  const metadata = SIA_MODE_METADATA[mode];

  return {
    mode,
    modeLabel: metadata.label,
    modeDescription: metadata.description,
    reasonCodes: [...new Set(reasonCodes)],
    clinicalPage,
    likelyProtectedData,
    containsSecret,
    blockBeforeModel,
    blockClinicalAttachment,
    allowLiveWebSearch: mode === 'GENERAL' && !input.hasAttachment && !blockBeforeModel,
  };
};
