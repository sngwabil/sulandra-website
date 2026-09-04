import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
const adapter = path.resolve('assets/codebase-backend-adapter.js');
await access(target);
await access(adapter);
let html = await readFile(target, 'utf8');
const source = await readFile(adapter, 'utf8');

for (const marker of [
  'SULANDRA_CODEBASE_BACKEND_ADAPTER_V2',
  'SULANDRA_CODEBASE_STANDALONE_CONTROLS_V1',
  'CODEBASE_VISIBLE_REGRESSIONS_V1',
  '/api/db/schema',
  '/api/sia/chat',
  '/api/preview-ticket',
  '/pty?token=',
  'sameOriginOpener',
  'wireCoreControls',
  'installSafeWorkspaceRenderer',
  'reattachTerminal',
  "window.location.assign('/it-solutions.html')",
]) {
  if (!source.includes(marker)) throw new Error(`Codebase backend adapter missing ${marker}`);
}

html = html.replace(
  "getToken: () => document.getElementById('cfg-token').value || 'test-token'",
  "getToken: () => document.getElementById('cfg-token').value || sessionStorage.getItem('sulandra:admin:access-token') || localStorage.getItem('sulandra:admin:access-token') || sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('token') || ''",
);
html = html.replace(
  "onclick=\"alert('Folder created in workspace')\"",
  "onclick=\"createWorkspaceFolder()\"",
);
html = html.replace(
  /\n\s*fetchFileSystem\(\);\n\s*openFallbackFile\('spire-evv-test-console\.html'\);\n\s*openFallbackFile\('service-request\.html'\);\n\s*openFallbackFile\('scls-tasks\.html'\);\n\s*openTerminal\(\);\n\s*setGridMode\(1\);/,
  "\n  fetchFileSystem();\n  setGridMode(1);",
);
html = html.replace(
  "      // Fallback explorer tree with rich color badges\n      renderFallbackFileSystem();",
  "      listEl.innerHTML = '<div style=\"padding:16px;color:#e57373;line-height:1.5\">Unable to load the real repository. Check Codebase API authentication or service health.</div>';",
);

const tag = '<script src="/assets/codebase-backend-adapter.js?v=20260903-visible-regressions-4"></script>';
html = html.replace(/\s*<script src="\/assets\/codebase-backend-adapter\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');

// IMPORTANT: Codebase contains sample HTML inside JavaScript template strings,
// including literal </body> text. Never use String.replace('</body>', ...),
// because that can inject a real </script> tag into the inline IDE runtime and
// make the entire application render as a non-interactive shell. Always anchor
// publication to the final document body close.
const lower = html.toLowerCase();
const bodyCloseIndex = lower.lastIndexOf('</body>');
const htmlCloseIndex = lower.lastIndexOf('</html>');
if (bodyCloseIndex < 0 || htmlCloseIndex < bodyCloseIndex) throw new Error('Codebase final body/html anchor changed');
html = `${html.slice(0, bodyCloseIndex)}${tag}\n${html.slice(bodyCloseIndex)}`;

const adapterIndex = html.indexOf(tag);
const finalBodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (adapterIndex < 0 || adapterIndex >= finalBodyIndex) throw new Error('Codebase adapter must be published before the final document body close');
if (html.indexOf(tag, adapterIndex + tag.length) !== -1) throw new Error('Codebase adapter must be published exactly once');
if (html.slice(adapterIndex + tag.length, finalBodyIndex).trim()) throw new Error('Codebase adapter must be the final executable element before </body>');
const beforeAdapter = html.slice(0, adapterIndex).toLowerCase();
if (beforeAdapter.lastIndexOf('<script') > beforeAdapter.lastIndexOf('</script>')) {
  throw new Error('Codebase adapter must never be injected inside an inline script/template string');
}

for (const marker of [
  'https://codebase-e2e-api-production.up.railway.app',
  'wss://sulandra-coding-terminal-worker-production.up.railway.app',
  'https://codebase-e2e-web-production.up.railway.app',
  '/assets/codebase-backend-adapter.js?v=20260903-visible-regressions-4',
  "sessionStorage.getItem('sulandra:admin:access-token')",
  'createWorkspaceFolder()',
]) {
  if (!html.includes(marker)) throw new Error(`Published Codebase contract missing ${marker}`);
}
if (html.includes("|| 'test-token'")) throw new Error('Published Codebase must not use the public test-token fallback');
if (/openFallbackFile\('spire-evv-test-console\.html'\)/.test(html)) throw new Error('Published Codebase must not preload demonstration source files');

await writeFile(target, html, 'utf8');
console.log(`Sulandra Codebase standalone backend/control adapter visible-regression revision published at the final document body anchor in ${target}`);