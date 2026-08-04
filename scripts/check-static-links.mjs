import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const criticalPages = [
  'index.html',
  'services.html',
  'careers.html',
  'employee-login.html',
  'employee-portal.html',
  'applicant-portal.html',
  'spire-workspace.html',
  'admin.html',
];
const redirectedPrefixes = [
  '/services/home-health',
  '/services/rehab',
  '/services/transportation',
  '/services/behavioral-health',
  '/services/respite-care',
  '/services/companion-care',
];

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function communityLivingPages() {
  const directory = path.join(repositoryRoot, 'services', 'community-living');
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => path.join('services', 'community-living', entry.name));
}

function localReference(rawReference) {
  const reference = rawReference.trim();
  if (!reference || reference.startsWith('#') || reference.startsWith('//')) return null;
  if (/^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(reference)) return null;
  if (reference.includes('${') || reference.includes('{{')) return null;
  const withoutFragment = reference.split('#', 1)[0].split('?', 1)[0];
  return withoutFragment || null;
}

async function resolves(page, reference) {
  if (reference.startsWith('/api/') || reference.startsWith('/public/')) return true;
  if (redirectedPrefixes.some((prefix) => reference === prefix || reference.startsWith(`${prefix}/`))) return true;

  let decoded;
  try { decoded = decodeURIComponent(reference); } catch { return false; }
  const relative = decoded.startsWith('/') ? decoded.slice(1) : path.join(path.dirname(page), decoded);
  const candidate = path.resolve(repositoryRoot, relative);
  if (!candidate.startsWith(`${repositoryRoot}${path.sep}`) && candidate !== repositoryRoot) return false;
  if (await exists(candidate)) {
    const details = await stat(candidate);
    if (details.isFile()) return true;
    if (details.isDirectory() && await exists(path.join(candidate, 'index.html'))) return true;
  }
  if (!path.extname(candidate) && await exists(`${candidate}.html`)) return true;
  if (decoded.endsWith('/') && await exists(path.join(candidate, 'index.html'))) return true;
  return false;
}

const pages = [...criticalPages, ...await communityLivingPages()];
const failures = [];
const attributePattern = /(?<![.\w])\b(?:href|src|action)\s*=\s*["']([^"'<>]+)["']/gi;

for (const page of pages) {
  const source = await readFile(path.join(repositoryRoot, page), 'utf8');
  const markup = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const match of markup.matchAll(attributePattern)) {
    const reference = localReference(match[1]);
    if (reference && !(await resolves(page, reference))) failures.push(`${page} -> ${reference}`);
  }
}

if (failures.length) {
  throw new Error(`Broken references in production pages:\n${[...new Set(failures)].sort().join('\n')}`);
}

console.log(`Validated local references in ${pages.length} production pages.`);
