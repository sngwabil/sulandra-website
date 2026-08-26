type SiaMessageLike = { role: 'user' | 'assistant'; content: string };

export type SiaDiagnosticTarget = {
  id: string;
  label: string;
  route: string;
  aliases: string[];
};

export type SiaProbeResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  detail: string;
};

export type SiaLiveDiagnostics = {
  checkedAt: string;
  target: SiaDiagnosticTarget | null;
  apiHealth: SiaProbeResult;
  staticPage: SiaProbeResult | null;
  github: {
    available: boolean;
    repository: string;
    branch: string;
    latestCommitSha: string | null;
    latestCommitMessage: string | null;
    latestCommitAt: string | null;
    latestWorkflowName: string | null;
    latestWorkflowStatus: string | null;
    latestWorkflowConclusion: string | null;
    detail: string;
  };
  railway: {
    runtimeDetected: boolean;
    projectId: string | null;
    environmentId: string | null;
    environmentName: string | null;
    serviceId: string | null;
    serviceName: string | null;
    publicDomain: string | null;
    managementApiConnected: boolean;
    managementReadAuthorized: boolean;
    latestDeploymentId: string | null;
    latestDeploymentStatus: string | null;
    latestDeploymentCreatedAt: string | null;
    logHighlights: string[];
    detail: string;
  };
};

export type SiaLiveDiagnosticOptions = {
  allowRailwayManagement?: boolean;
};

const TARGETS: SiaDiagnosticTarget[] = [
  { id: 'employee-login', label: 'Employee Sign-In', route: '/employee-login.html', aliases: ['employee sign in', 'employee signin', 'employee login', 'employee-login.html'] },
  { id: 'employee-portal', label: 'Employee Portal', route: '/employee-portal.html', aliases: ['employee portal', 'employee-portal.html'] },
  { id: 'admin-login', label: 'Administrator Sign-In', route: '/admin-login.html', aliases: ['admin sign in', 'administrator sign in', 'admin login', 'administrator login', 'admin-login.html'] },
  { id: 'admin-portal', label: 'Administrator Portal', route: '/admin.html', aliases: ['admin portal', 'administrator portal', 'admin.html'] },
  { id: 'admin-operations', label: 'Admin Operations', route: '/admin-operations.html', aliases: ['admin operations', 'admin-operations.html'] },
  { id: 'sia', label: 'SIA', route: '/sia.html', aliases: ['sia', 'sulandra intelligent assistant', 'sia.html'] },
  { id: 'scheduling', label: 'Scheduling', route: '/scheduling.html', aliases: ['scheduling', 'schedule page', 'scheduling.html'] },
  { id: 'spire', label: 'SPIRE Clinical', route: '/spire.html', aliases: ['spire', 'spire clinical', 'chart', 'patient chart', 'mar', 'emar', 'spire.html'] },
  { id: 'my-work', label: 'My Work', route: '/my-work.html', aliases: ['my work', 'my-work.html'] },
  { id: 'education', label: 'Education Portal', route: '/education-portal.html', aliases: ['education portal', 'education-portal.html'] },
  { id: 'intranet', label: 'Intranet Portal', route: '/intranet.html', aliases: ['intranet', 'intranet portal', 'intranet.html'] },
  { id: 'support', label: 'Support', route: '/support.html', aliases: ['support page', 'support.html'] },
  { id: 'workforce', label: 'Workforce', route: '/workforce.html', aliases: ['workforce', 'workforce.html'] },
];

const loadingPattern = /\b(stuck|loading|load(?:ing)? forever|spinn(?:ing|er)|blank|black(?:ed)?|black screen|white screen|frozen|freeze|not rendering|won't load|doesn't load|does not load|hang(?:ing|s)?)\b/i;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (value: string) => value.toLowerCase().replace(/https?:\/\/[^/\s]+/g, '').replace(/[?#][^\s]*/g, '').replace(/\s+/g, ' ').trim();
const aliasMatches = (text: string, alias: string) => {
  const normalizedAlias = alias.toLowerCase();
  if (normalizedAlias.includes(' ') || normalizedAlias.includes('.') || normalizedAlias.includes('-')) return text.includes(normalizedAlias);
  return new RegExp(`\\b${escapeRegex(normalizedAlias)}\\b`, 'i').test(text);
};

export const isPageLoadingIntent = (message: string, history: SiaMessageLike[] = []) => {
  if (loadingPattern.test(message)) return true;
  return history.slice(-5).some((entry) => entry.role === 'user' && loadingPattern.test(entry.content));
};

export const detectSiaDiagnosticTarget = (message: string, history: SiaMessageLike[] = []) => {
  const candidates = [message, ...history.slice(-6).reverse().filter((entry) => entry.role === 'user').map((entry) => entry.content)];
  for (const candidate of candidates) {
    const text = normalize(candidate);
    for (const target of TARGETS) {
      if (text.includes(target.route.toLowerCase()) || target.aliases.some((alias) => aliasMatches(text, alias))) return target;
    }
  }
  return null;
};

export const siaNeedsAffectedPageClarification = (message: string, history: SiaMessageLike[], hasScreenshot: boolean) => {
  if (!isPageLoadingIntent(message, history)) return false;
  if (hasScreenshot) return false;
  return !detectSiaDiagnosticTarget(message, history);
};

export const affectedPageClarificationReply = () => `Which Sulandra page is stuck, blank, black, or still loading?

Reply with the **page name** or paste the **non-sensitive URL**. For example:
- SPIRE Clinical
- Employee Portal
- Administrator Portal
- Scheduling
- My Work
- Education Portal
- Intranet Portal
- SIA

If the page is black/blank or only part of it rendered, attach a screenshot. Once I know the affected page, I’ll use the current Sulandra service/release evidence available to me and guide you through the next check one step at a time.`;

const withTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
};

const normalizeBaseUrl = (value: string | undefined, fallback: string) => {
  const raw = value?.trim();
  if (!raw) return fallback;
  return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`;
};

const probe = async (url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<SiaProbeResult> => {
  try {
    const { response, latencyMs } = await withTimeout(url, { method, redirect: 'manual', headers: { 'User-Agent': 'Sulandra-SIA/1.0' } }, 5500);
    const ok = response.status >= 200 && response.status < 400;
    return { ok, status: response.status, latencyMs, detail: ok ? 'reachable' : `HTTP ${response.status}` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'probe failed';
    return { ok: false, status: null, latencyMs: null, detail };
  }
};

type GitHubCache = { expiresAt: number; value: SiaLiveDiagnostics['github'] };
let githubCache: GitHubCache | null = null;

const githubDiagnostics = async (): Promise<SiaLiveDiagnostics['github']> => {
  if (githubCache && githubCache.expiresAt > Date.now()) return githubCache.value;
  const repository = 'sngwabil/sulandra-website';
  const branch = 'release/sulandra-1.0';
  const base = `https://api.github.com/repos/${repository}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Sulandra-SIA/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.SIA_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const [commitCall, workflowCall] = await Promise.all([
      withTimeout(`${base}/commits/${encodeURIComponent(branch)}`, { headers }, 5500),
      withTimeout(`${base}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`, { headers }, 5500),
    ]);
    const commitPayload = commitCall.response.ok ? await commitCall.response.json() as any : null;
    const workflowPayload = workflowCall.response.ok ? await workflowCall.response.json() as any : null;
    const latestRun = Array.isArray(workflowPayload?.workflow_runs) ? workflowPayload.workflow_runs[0] : null;
    const value = {
      available: Boolean(commitPayload || latestRun),
      repository,
      branch,
      latestCommitSha: typeof commitPayload?.sha === 'string' ? commitPayload.sha : null,
      latestCommitMessage: typeof commitPayload?.commit?.message === 'string' ? commitPayload.commit.message.split('\n')[0] : null,
      latestCommitAt: typeof commitPayload?.commit?.committer?.date === 'string' ? commitPayload.commit.committer.date : null,
      latestWorkflowName: typeof latestRun?.name === 'string' ? latestRun.name : null,
      latestWorkflowStatus: typeof latestRun?.status === 'string' ? latestRun.status : null,
      latestWorkflowConclusion: typeof latestRun?.conclusion === 'string' ? latestRun.conclusion : null,
      detail: commitPayload || latestRun ? (token ? 'authenticated GitHub release/CI read' : 'public GitHub release/CI read') : 'GitHub returned no usable release evidence',
    };
    githubCache = { expiresAt: Date.now() + 60_000, value };
    return value;
  } catch (error) {
    const value = {
      available: false,
      repository,
      branch,
      latestCommitSha: null,
      latestCommitMessage: null,
      latestCommitAt: null,
      latestWorkflowName: null,
      latestWorkflowStatus: null,
      latestWorkflowConclusion: null,
      detail: error instanceof Error ? error.message : 'GitHub diagnostics unavailable',
    };
    githubCache = { expiresAt: Date.now() + 20_000, value };
    return value;
  }
};

const redactInfraLine = (value: string) => value
  .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
  .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi, 'Bearer [REDACTED_TOKEN]')
  .replace(/\b(postgres(?:ql)?|redis|mysql):\/\/[^\s]+/gi, '$1://[REDACTED_CONNECTION]')
  .replace(/\b(password|secret|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .slice(0, 900);

const railwayGraphql = async (query: string, variables: Record<string, unknown>, projectToken: string | null, accountToken: string | null) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'Sulandra-SIA/1.0' };
  if (projectToken) headers['Project-Access-Token'] = projectToken;
  else if (accountToken) headers.Authorization = `Bearer ${accountToken}`;
  const { response } = await withTimeout('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  }, 6500);
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok || Array.isArray(payload?.errors)) {
    const message = Array.isArray(payload?.errors) && payload.errors[0]?.message ? String(payload.errors[0].message) : `Railway API HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload?.data || {};
};

const railwayManagementDiagnostics = async (allowManagement: boolean): Promise<Pick<SiaLiveDiagnostics['railway'], 'managementApiConnected' | 'managementReadAuthorized' | 'latestDeploymentId' | 'latestDeploymentStatus' | 'latestDeploymentCreatedAt' | 'logHighlights' | 'detail'>> => {
  const projectToken = process.env.SIA_RAILWAY_TOKEN?.trim() || process.env.RAILWAY_TOKEN?.trim() || null;
  const accountToken = process.env.RAILWAY_API_TOKEN?.trim() || null;
  const connected = Boolean(projectToken || accountToken);
  const projectId = process.env.RAILWAY_PROJECT_ID || null;
  const serviceId = process.env.RAILWAY_SERVICE_ID || null;
  if (!connected) {
    return {
      managementApiConnected: false,
      managementReadAuthorized: false,
      latestDeploymentId: null,
      latestDeploymentStatus: null,
      latestDeploymentCreatedAt: null,
      logHighlights: [],
      detail: 'Railway runtime metadata and live service-health probes are available; deployment/log management API is not connected to SIA yet.',
    };
  }
  if (!allowManagement) {
    return {
      managementApiConnected: true,
      managementReadAuthorized: false,
      latestDeploymentId: null,
      latestDeploymentStatus: null,
      latestDeploymentCreatedAt: null,
      logHighlights: [],
      detail: 'Railway management integration is connected, but this authenticated SIA session is not authorized to receive deployment/log diagnostics.',
    };
  }
  if (!projectId || !serviceId) {
    return {
      managementApiConnected: true,
      managementReadAuthorized: true,
      latestDeploymentId: null,
      latestDeploymentStatus: null,
      latestDeploymentCreatedAt: null,
      logHighlights: [],
      detail: 'Railway management integration is connected, but runtime project/service identifiers are unavailable.',
    };
  }

  try {
    const deploymentData = await railwayGraphql(
      `query deployments($input: DeploymentListInput!) { deployments(input: $input, first: 5) { edges { node { id status createdAt } } } }`,
      { input: { projectId, serviceId } },
      projectToken,
      accountToken,
    );
    const latest = Array.isArray(deploymentData?.deployments?.edges) ? deploymentData.deployments.edges[0]?.node : null;
    if (!latest?.id) {
      return {
        managementApiConnected: true,
        managementReadAuthorized: true,
        latestDeploymentId: null,
        latestDeploymentStatus: null,
        latestDeploymentCreatedAt: null,
        logHighlights: [],
        detail: 'Railway management read succeeded, but no recent deployment was returned for this service.',
      };
    }

    const logData = await railwayGraphql(
      `query deploymentLogs($deploymentId: String!, $limit: Int) { deploymentLogs(deploymentId: $deploymentId, limit: $limit) { timestamp message severity } }`,
      { deploymentId: latest.id, limit: 80 },
      projectToken,
      accountToken,
    );
    const rows = Array.isArray(logData?.deploymentLogs) ? logData.deploymentLogs : [];
    const interesting = rows.filter((row: any) => {
      const severity = String(row?.severity || '').toLowerCase();
      const message = String(row?.message || '');
      return severity === 'error' || severity === 'warn' || /\b(fail|failed|error|crash|timeout| 5\d\d | 4\d\d |\/health|\/api\/|listening|migration)\b/i.test(` ${message} `);
    });
    const selected = (interesting.length ? interesting : rows.slice(-20)).slice(-14).map((row: any) => {
      const timestamp = typeof row?.timestamp === 'string' ? row.timestamp : '';
      const severity = typeof row?.severity === 'string' ? row.severity.toUpperCase() : 'INFO';
      return redactInfraLine(`${timestamp} ${severity} ${String(row?.message || '')}`.trim());
    });
    return {
      managementApiConnected: true,
      managementReadAuthorized: true,
      latestDeploymentId: String(latest.id),
      latestDeploymentStatus: typeof latest.status === 'string' ? latest.status : null,
      latestDeploymentCreatedAt: typeof latest.createdAt === 'string' ? latest.createdAt : null,
      logHighlights: selected,
      detail: 'Authorized read-only Railway deployment status and sanitized log highlights were retrieved for this service.',
    };
  } catch (error) {
    return {
      managementApiConnected: true,
      managementReadAuthorized: true,
      latestDeploymentId: null,
      latestDeploymentStatus: null,
      latestDeploymentCreatedAt: null,
      logHighlights: [],
      detail: `Railway management read failed: ${redactInfraLine(error instanceof Error ? error.message : 'unknown Railway API error')}`,
    };
  }
};

export const collectSiaLiveDiagnostics = async (target: SiaDiagnosticTarget | null, options: SiaLiveDiagnosticOptions = {}): Promise<SiaLiveDiagnostics> => {
  const apiBase = normalizeBaseUrl(
    process.env.RAILWAY_SERVICE_SULANDRA_WEBSITE_URL || process.env.RAILWAY_PUBLIC_DOMAIN,
    'https://sulandra-website-production-5fc4.up.railway.app',
  );
  const siteBase = normalizeBaseUrl(process.env.RAILWAY_STATIC_URL, 'https://www.sulandrahealth.com');
  const [apiHealth, staticPage, github, railwayManagement] = await Promise.all([
    probe(`${apiBase}/health`),
    target ? probe(`${siteBase}${target.route}`, 'HEAD') : Promise.resolve(null),
    githubDiagnostics(),
    railwayManagementDiagnostics(Boolean(options.allowRailwayManagement)),
  ]);

  const railwayRuntimeDetected = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_ID);
  return {
    checkedAt: new Date().toISOString(),
    target,
    apiHealth,
    staticPage,
    github,
    railway: {
      runtimeDetected: railwayRuntimeDetected,
      projectId: process.env.RAILWAY_PROJECT_ID || null,
      environmentId: process.env.RAILWAY_ENVIRONMENT_ID || null,
      environmentName: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || null,
      serviceId: process.env.RAILWAY_SERVICE_ID || null,
      serviceName: process.env.RAILWAY_SERVICE_NAME || null,
      publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || null,
      ...railwayManagement,
    },
  };
};

export const serializeSiaLiveDiagnostics = (diagnostics: SiaLiveDiagnostics) => {
  const target = diagnostics.target ? `${diagnostics.target.label} (${diagnostics.target.route})` : 'NOT_CONFIRMED';
  return [
    `serverDiagnosticCheckedAt: ${diagnostics.checkedAt}`,
    `serverDiagnosticTarget: ${target}`,
    `serverRailwayBackedApiHealth: ${JSON.stringify(diagnostics.apiHealth)}`,
    `serverStaticPageProbe: ${JSON.stringify(diagnostics.staticPage)}`,
    `serverGitHubReleaseEvidence: ${JSON.stringify(diagnostics.github)}`,
    `serverRailwayRuntimeEvidence: ${JSON.stringify(diagnostics.railway)}`,
  ];
};
