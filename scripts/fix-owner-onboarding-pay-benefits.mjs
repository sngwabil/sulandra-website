import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const adminPath = path.join(dist, 'admin-railway.js');
const leavePath = path.join(dist, 'assets', 'employee-leave-self-service.js');
const portalPath = path.join(dist, 'employee-portal.html');
const payRouteAsset = path.join(dist, 'assets', 'employee-pay-benefits-route-fix.js');
const ADMIN_MARKER = 'OWNER_ENTERPRISE_ONBOARDING_V1';
const PAY_VERSION = '20260827-pay-benefits-route-1';

const replaceRequired = (source, needle, replacement, label) => {
  if (!source.includes(needle)) throw new Error(`${label} anchor changed`);
  return source.replace(needle, replacement);
};

const replacePatternRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`${label} anchor changed`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
};

let admin = await readFile(adminPath, 'utf8');
if (!admin.includes(ADMIN_MARKER)) {
  admin = replaceRequired(
    admin,
    '  "use strict";',
    `  "use strict";\n\n  /* ${ADMIN_MARKER} */`,
    'Owner enterprise onboarding marker',
  );

  admin = replaceRequired(
    admin,
    '    const entityHeaders = window.SulandraCompanyContext?.headers?.() || {};',
    '    const entityHeaders = IS_OWNER_CONSOLE ? {} : (window.SulandraCompanyContext?.headers?.() || {});',
    'Owner Admin default company-header isolation',
  );

  admin = replaceRequired(
    admin,
    '      const text = `${appName(app)} ${app.email || ""} ${app.phone || ""} ${app.jobTitle || ""} ${appRole(app)}`.toLowerCase();',
    '      const text = `${appName(app)} ${app.email || ""} ${app.phone || ""} ${app.jobTitle || ""} ${appRole(app)} ${app.legalEntityName || ""} ${app.legalEntityCode || ""}`.toLowerCase();',
    'Applicant search company metadata',
  );

  admin = replacePatternRequired(
    admin,
    /  function appRow\(app, archived\) \{[\s\S]*?\n  \}\n\n  function renderApplications/,
    `  function applicantCompany(app) {\n    return String(app?.legalEntityName || app?.legalEntityCode || '').trim();\n  }\n\n  function appRow(app, archived) {\n    const rawDate = app.submittedAt || app.createdAt;\n    const date = rawDate ? new Date(rawDate).toLocaleDateString() : "—";\n    const score = app.assessmentScore == null ? "—" : app.assessmentScore;\n    const role = app.jobTitle || title(appRole(app));\n    const company = applicantCompany(app);\n    const companyLine = IS_OWNER_CONSOLE && company ? \`<div class="muted" style="font-weight:850;color:#0b6595">\${esc(company)}</div>\` : "";\n    if (archived) return \`<tr><td>\${esc(date)}</td><td><strong>\${esc(appName(app))}</strong>\${companyLine}<div class="muted">\${esc(app.email || app.phone || "")}</div></td><td>\${esc(role)}</td><td>\${esc(score)}</td><td><button class="btn btn-primary" data-application-id="\${esc(app.id)}">Open folder</button></td></tr>\`;\n    return \`<tr><td>\${esc(date)}</td><td><strong>\${esc(appName(app))}</strong>\${companyLine}<div class="muted">\${esc(app.email || app.phone || "")}</div></td><td>\${esc(role)}</td><td><span class="score">\${esc(score)}</span></td><td><span class="status-pill">\${esc(title(appStatus(app)))}</span></td><td><button class="btn btn-primary" data-application-id="\${esc(app.id)}">Open folder</button></td></tr>\`;\n  }\n\n  function renderApplications`,
    'Applicant row renderer',
  );

  admin = replaceRequired(
    admin,
    '    if ($("countLabel")) $("countLabel").textContent = `${active.length} active application${active.length === 1 ? "" : "s"}`;',
    '    if ($("countLabel")) $("countLabel").textContent = IS_OWNER_CONSOLE ? `${active.length} active application${active.length === 1 ? "" : "s"} across Sulandra` : `${active.length} active application${active.length === 1 ? "" : "s"}`;',
    'Owner applicant count label',
  );

  admin = replacePatternRequired(
    admin,
    /  async function loadApplications\(\) \{[\s\S]*?\n  \}\n\n  function openingPayload/,
    `  const applicationRows = (result) => Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];\n\n  async function loadApplications() {\n    if (IS_OWNER_CONSOLE) {\n      const context = await api("/api/entity-context");\n      const entities = Array.isArray(context?.entities) ? context.entities.filter((entity) => entity?.id) : [];\n      if (!entities.length) throw new Error("No Sulandra companies are available to the enterprise owner.");\n      const requests = entities.flatMap((entity) => [false, true].map(async (archived) => {\n        const result = await api(\`/api/admin/applications?archived=\${archived ? "true" : "false"}&limit=200\`, {\n          headers: { "X-Legal-Entity-Id": entity.id }\n        });\n        return applicationRows(result).map((app) => ({\n          ...app,\n          legalEntityId: app.legalEntityId || entity.id,\n          legalEntityCode: app.legalEntityCode || entity.code || "",\n          legalEntityName: app.legalEntityName || entity.displayName || entity.code || "Sulandra company"\n        }));\n      }));\n      const settled = await Promise.allSettled(requests);\n      const successful = settled.filter((item) => item.status === "fulfilled");\n      if (!successful.length) {\n        const failed = settled.find((item) => item.status === "rejected");\n        throw failed?.reason instanceof Error ? failed.reason : new Error("Sulandra applicant records are unavailable.");\n      }\n      applications = successful.flatMap((item) => item.value);\n    } else {\n      const [activeResult, archivedResult] = await Promise.all([\n        api("/api/admin/applications?archived=false&limit=200"),\n        api("/api/admin/applications?archived=true&limit=200")\n      ]);\n      applications = [...applicationRows(activeResult), ...applicationRows(archivedResult)];\n    }\n    renderApplications();\n    if ($("livePill")) $("livePill").textContent = "Railway: connected";\n  }\n\n  function openingPayload`,
    'Applicant loader',
  );

  admin = replacePatternRequired(
    admin,
    /  function openFolder\(id\) \{[\s\S]*?\n  \}\n\n  function exportApplications/,
    `  let ownerApplicantBaseContext = null;\n  let ownerApplicantScopeInstalled = false;\n\n  function useOwnerApplicantContext(app) {\n    if (!IS_OWNER_CONSOLE || !app?.legalEntityId) return;\n    if (!ownerApplicantScopeInstalled) {\n      ownerApplicantBaseContext = window.SulandraCompanyContext || null;\n      ownerApplicantScopeInstalled = true;\n    }\n    const base = ownerApplicantBaseContext;\n    window.__SULANDRA_OWNER_APPLICANT_ENTITY__ = {\n      id: app.legalEntityId,\n      code: app.legalEntityCode || '',\n      displayName: app.legalEntityName || app.legalEntityCode || 'Sulandra company',\n      status: 'ACTIVE'\n    };\n    window.SulandraCompanyContext = {\n      __ownerApplicantScope: true,\n      headers: () => window.__SULANDRA_OWNER_APPLICANT_ENTITY__?.id\n        ? { 'X-Legal-Entity-Id': window.__SULANDRA_OWNER_APPLICANT_ENTITY__.id }\n        : (base?.headers?.() || {}),\n      current: () => window.__SULANDRA_OWNER_APPLICANT_ENTITY__ || base?.current?.() || null,\n      context: () => base?.context?.() || null,\n      initialize: (...args) => typeof base?.initialize === 'function' ? base.initialize(...args) : Promise.resolve(null),\n      storageKey: base?.storageKey || 'sulandra:admin:legal-entity-id',\n      sharedStorageKey: base?.sharedStorageKey || 'sulandra:selected-legal-entity-id'\n    };\n  }\n\n  function restoreOwnerApplicantContext() {\n    if (!IS_OWNER_CONSOLE || !ownerApplicantScopeInstalled) return;\n    window.__SULANDRA_OWNER_APPLICANT_ENTITY__ = null;\n    if (ownerApplicantBaseContext) window.SulandraCompanyContext = ownerApplicantBaseContext;\n    else { try { delete window.SulandraCompanyContext; } catch (_) { window.SulandraCompanyContext = undefined; } }\n    ownerApplicantBaseContext = null;\n    ownerApplicantScopeInstalled = false;\n  }\n\n  function openFolder(id) {\n    const app = applications.find((a) => String(a.id) === String(id));\n    if (!window.SulandraCareersWorkflow || !("modalBody" in Object.fromEntries([["modalBody", $("modalBody")]])) || !$("modalBody")) { toast("Applicant workflow unavailable", "The applicant workflow script did not load."); return; }\n    useOwnerApplicantContext(app);\n    loadInterviewSchedulerScript();\n    $("detailsModal").style.display = "block";\n    $("modalTitle").textContent = appName(app || {});\n    $("modalBody").replaceChildren();\n    window.SulandraCareersWorkflow.mount({ root: $("modalBody"), applicationId: id, apiBase: API_BASE, getToken: token, onUpdated: loadApplications });\n  }\n\n  function exportApplications`,
    'Applicant folder owner company scope',
  );

  // Simplify the generated guard above to the canonical existing modal check.
  admin = admin.replace('if (!window.SulandraCareersWorkflow || !("modalBody" in Object.fromEntries([["modalBody", $("modalBody")]])) || !$("modalBody"))', 'if (!window.SulandraCareersWorkflow || !$("modalBody"))');

  admin = replaceRequired(
    admin,
    '    $("closeModalBtn")?.addEventListener("click", () => { $("detailsModal").style.display = "none"; $("modalBody")?.replaceChildren(); });',
    '    $("closeModalBtn")?.addEventListener("click", () => { $("detailsModal").style.display = "none"; $("modalBody")?.replaceChildren(); restoreOwnerApplicantContext(); });',
    'Applicant folder context restore',
  );

  admin = replacePatternRequired(
    admin,
    /  function exportApplications\(\) \{[\s\S]*?\n  \}\n\n  async function loadDashboard/,
    `  function exportApplications() {\n    const rows = filteredApps(false);\n    const data = [["Submitted", "Company", "Applicant", "Email", "Phone", "Role", "Score", "Status"], ...rows.map((a) => [a.submittedAt || a.createdAt || "", applicantCompany(a), appName(a), a.email || "", a.phone || "", a.jobTitle || title(appRole(a)), a.assessmentScore ?? "", title(appStatus(a))])];\n    const csv = data.map((row) => row.map((v) => \`"\${String(v).replaceAll('"', '""')}"\`).join(",")).join("\\n");\n    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));\n    const link = document.createElement("a");\n    link.href = url; link.download = \`sulandra-applicants-\${new Date().toISOString().slice(0, 10)}.csv\`; link.click(); URL.revokeObjectURL(url);\n  }\n\n  async function loadDashboard`,
    'Applicant export company column',
  );

  try { new Function(admin); } catch (error) { throw new Error(`Owner enterprise onboarding publication has JavaScript syntax error: ${error.message}`); }
  await writeFile(adminPath, admin, 'utf8');
}

let leave = await readFile(leavePath, 'utf8');
const leaveMarker = 'PAY_BENEFITS_BEFORE_LEAVE_V1';
if (!leave.includes(leaveMarker)) {
  leave = replaceRequired(
    leave,
    "styles();hero.insertAdjacentHTML('afterend',shell());",
    `styles();/* ${leaveMarker} */const anchor=document.getElementById('employeeCompensation')||hero;anchor.insertAdjacentHTML('afterend',shell());`,
    'Employee Leave placement',
  );
  try { new Function(leave); } catch (error) { throw new Error(`Employee Leave publication has JavaScript syntax error: ${error.message}`); }
  await writeFile(leavePath, leave, 'utf8');
}

await stat(payRouteAsset);
const payRouteSource = await readFile(payRouteAsset, 'utf8');
try { new Function(payRouteSource); } catch (error) { throw new Error(`My Pay & Benefits route fix has JavaScript syntax error: ${error.message}`); }

let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(/\s*<script[^>]+src=["']\/assets\/employee-pay-benefits-route-fix\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi, '\n');
const payTag = `<script src="/assets/employee-pay-benefits-route-fix.js?v=${PAY_VERSION}" defer data-pay-benefits-route="${PAY_VERSION}"></script>`;
if (!portal.includes('</body>')) throw new Error('Employee Portal publication is missing a closing body tag');
portal = portal.replace('</body>', `${payTag}\n</body>`);
await writeFile(portalPath, portal, 'utf8');

const verifyAdmin = await readFile(adminPath, 'utf8');
const verifyPortal = await readFile(portalPath, 'utf8');
for (const marker of [ADMIN_MARKER, '/api/entity-context', 'across Sulandra', 'X-Legal-Entity-Id', 'restoreOwnerApplicantContext']) {
  if (!verifyAdmin.includes(marker)) throw new Error(`Owner enterprise onboarding publication missing ${marker}`);
}
for (const marker of [leaveMarker, `employee-pay-benefits-route-fix.js?v=${PAY_VERSION}`, `data-pay-benefits-route="${PAY_VERSION}"`]) {
  if (!(marker === leaveMarker ? (await readFile(leavePath, 'utf8')) : verifyPortal).includes(marker)) throw new Error(`My Pay & Benefits publication missing ${marker}`);
}
console.log('Owner Onboarding now aggregates active and archived applicants across every Sulandra company returned by enterprise entity context, opens each folder in its owning-company scope, and labels the company. Employee Portal My Pay & Benefits now routes to the pay/benefits workspace and Leave is positioned after it.');
