import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
const adapter = path.resolve('assets/codebase-backend-adapter.js');
const previewFix = path.resolve('assets/codebase-preview-terminal-input-fix.js');
const ipadKeyboardBridge = path.resolve('assets/codebase-ipad-terminal-keyboard-bridge.js');
const nativePaste = path.resolve('assets/codebase-terminal-native-paste.js');
const terminalDurability = path.resolve('assets/codebase-terminal-session-durability.js');
await access(target);
await access(adapter);
await access(previewFix);
await access(ipadKeyboardBridge);
await access(nativePaste);
await access(terminalDurability);
let html = await readFile(target, 'utf8');
const source = await readFile(adapter, 'utf8');
const previewSource = await readFile(previewFix, 'utf8');
const ipadKeyboardSource = await readFile(ipadKeyboardBridge, 'utf8');
const nativePasteSource = await readFile(nativePaste, 'utf8');
const durabilitySource = await readFile(terminalDurability, 'utf8');

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

for (const marker of [
  'CODEBASE_PREVIEW_TERMINAL_INPUT_V2',
  'CODEBASE_PREVIEW_TERMINAL_INPUT_V3',
  'codebase-preview-toolbar',
  "surface:'codebase'",
  'setPreviewDark',
  'previewIntent',
  'terminalDataFromKey',
  'editorFallbackKey',
  'codebaseKeyboardBound',
  'preserveLiveTerminalNodes',
  'canonicalResetPacket',
  "addEventListener('paste'",
  'term.focus',
  '#railway-preview-iframe',
]) {
  if (!previewSource.includes(marker)) throw new Error(`Codebase preview/input repair missing ${marker}`);
}

for (const marker of [
  'CODEBASE_IPAD_TERMINAL_KEYBOARD_V4',
  'codebase-ipad-terminal-keyboard-bridge',
  "addEventListener('beforeinput'",
  "addEventListener('input'",
  "addEventListener('compositionend'",
  "addEventListener('touchend'",
  'term.__sulandraWs',
]) {
  if (!ipadKeyboardSource.includes(marker)) throw new Error(`Codebase iPad keyboard bridge missing ${marker}`);
}

for (const marker of [
  'CODEBASE_TERMINAL_NATIVE_PASTE_V1',
  "typeof term.paste!=='function'",
  'term.paste(text)',
  "addEventListener('paste'",
  "insertFromPaste",
  'stopImmediatePropagation',
]) {
  if (!nativePasteSource.includes(marker)) throw new Error(`Codebase native paste runtime missing ${marker}`);
}

for (const marker of [
  'CODEBASE_TERMINAL_SESSION_DURABILITY_V1',
  'sulandra:codebase:terminal-session-state:v1',
  'freshestToken',
  'ResumeWebSocket',
  "searchParams.set('sessionId'",
  'data-codebase-active-terminal',
  'sessionStorage.setItem',
  'restoreState',
]) {
  if (!durabilitySource.includes(marker)) throw new Error(`Codebase terminal durability runtime missing ${marker}`);
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

const adapterTag = '<script src="/assets/codebase-backend-adapter.js?v=20260903-visible-regressions-5"></script>';
const previewTag = '<script src="/assets/codebase-preview-terminal-input-fix.js?v=20260904-terminal-live-input-3"></script>';
const ipadKeyboardTag = '<script src="/assets/codebase-ipad-terminal-keyboard-bridge.js?v=20260904-ipad-keyboard-4"></script>';
const nativePasteTag = '<script src="/assets/codebase-terminal-native-paste.js?v=20260905-native-paste-1"></script>';
const durabilityTag = '<script src="/assets/codebase-terminal-session-durability.js?v=20260904-session-durability-1"></script>';
html = html.replace(/\s*<script src="\/assets\/codebase-backend-adapter\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-preview-terminal-input-fix\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-ipad-terminal-keyboard-bridge\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-terminal-native-paste\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-terminal-session-durability\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');

// IMPORTANT: Codebase contains sample HTML inside JavaScript template strings,
// including literal </body> text. Never use String.replace('</body>', ...),
// because that can inject a real </script> tag into the inline IDE runtime and
// make the entire application render as a non-interactive shell. Always anchor
// publication to the final document body close.
const lower = html.toLowerCase();
const bodyCloseIndex = lower.lastIndexOf('</body>');
const htmlCloseIndex = lower.lastIndexOf('</html>');
if (bodyCloseIndex < 0 || htmlCloseIndex < bodyCloseIndex) throw new Error('Codebase final body/html anchor changed');
html = `${html.slice(0, bodyCloseIndex)}${adapterTag}\n${previewTag}\n${ipadKeyboardTag}\n${nativePasteTag}\n${durabilityTag}\n${html.slice(bodyCloseIndex)}`;

const adapterIndex = html.indexOf(adapterTag);
const previewIndex = html.indexOf(previewTag);
const ipadKeyboardIndex = html.indexOf(ipadKeyboardTag);
const nativePasteIndex = html.indexOf(nativePasteTag);
const durabilityIndex = html.indexOf(durabilityTag);
const finalBodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (adapterIndex < 0 || previewIndex <= adapterIndex || ipadKeyboardIndex <= previewIndex || nativePasteIndex <= ipadKeyboardIndex || durabilityIndex <= nativePasteIndex || durabilityIndex >= finalBodyIndex) throw new Error('Codebase runtime publication order is invalid');
if (html.indexOf(adapterTag, adapterIndex + adapterTag.length) !== -1) throw new Error('Codebase adapter must be published exactly once');
if (html.indexOf(previewTag, previewIndex + previewTag.length) !== -1) throw new Error('Codebase preview/input repair must be published exactly once');
if (html.indexOf(ipadKeyboardTag, ipadKeyboardIndex + ipadKeyboardTag.length) !== -1) throw new Error('Codebase iPad keyboard bridge must be published exactly once');
if (html.indexOf(nativePasteTag, nativePasteIndex + nativePasteTag.length) !== -1) throw new Error('Codebase native paste runtime must be published exactly once');
if (html.indexOf(durabilityTag, durabilityIndex + durabilityTag.length) !== -1) throw new Error('Codebase terminal durability runtime must be published exactly once');
if (html.slice(durabilityIndex + durabilityTag.length, finalBodyIndex).trim()) throw new Error('Codebase terminal durability runtime must be the final executable element before </body>');
const beforeAdapter = html.slice(0, adapterIndex).toLowerCase();
if (beforeAdapter.lastIndexOf('<script') > beforeAdapter.lastIndexOf('</script>')) {
  throw new Error('Codebase adapter must never be injected inside an inline script/template string');
}

for (const marker of [
  'https://codebase-e2e-api-production.up.railway.app',
  'wss://sulandra-coding-terminal-worker-production.up.railway.app',
  'https://codebase-e2e-web-production.up.railway.app',
  '/assets/codebase-backend-adapter.js?v=20260903-visible-regressions-5',
  '/assets/codebase-preview-terminal-input-fix.js?v=20260904-terminal-live-input-3',
  '/assets/codebase-ipad-terminal-keyboard-bridge.js?v=20260904-ipad-keyboard-4',
  '/assets/codebase-terminal-native-paste.js?v=20260905-native-paste-1',
  '/assets/codebase-terminal-session-durability.js?v=20260904-session-durability-1',
  "sessionStorage.getItem('sulandra:admin:access-token')",
  'createWorkspaceFolder()',
]) {
  if (!html.includes(marker)) throw new Error(`Published Codebase contract missing ${marker}`);
}
if (html.includes("|| 'test-token'")) throw new Error('Published Codebase must not use the public test-token fallback');
if (/openFallbackFile\('spire-evv-test-console\.html'\)/.test(html)) throw new Error('Published Codebase must not preload demonstration source files');

await writeFile(target, html, 'utf8');
console.log(`Sulandra Codebase backend adapter + terminal live-input repair + iPad keyboard bridge + native paste semantics + session durability runtime published at the final document body anchor in ${target}`);
