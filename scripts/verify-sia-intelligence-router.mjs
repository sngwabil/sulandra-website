import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const [routerSource, routeSource, copilotSource, standaloneSource, copilotCss, standaloneCss, siaHtml] = await Promise.all([
  read('api/src/sia-mode-router.ts'),
  read('api/src/sia-routes.ts'),
  read('assets/sia-copilot.js'),
  read('assets/sia.js'),
  read('assets/sia-copilot.css'),
  read('assets/sia-futuristic.css'),
  read('sia.html'),
]);

const cases = [
  ['date question', { message: 'What day is today?' }, { mode: 'GENERAL', allowLiveWebSearch: true, blockBeforeModel: false }],
  ['time question', { message: 'What time is it?' }, { mode: 'GENERAL', allowLiveWebSearch: true }],
  ['current information', { message: 'What is the latest major space news?' }, { mode: 'GENERAL', allowLiveWebSearch: true }],
  ['general bank account question', { message: 'What is a bank account?' }, { mode: 'GENERAL', allowLiveWebSearch: true }],
  ['general question from Employee Portal', { message: 'What is the capital of France?', application: 'Employee Portal', page: '/employee-portal.html' }, { mode: 'GENERAL', allowLiveWebSearch: true }],
  ['weather temperature question', { message: "What's the temperature outside?" }, { mode: 'GENERAL', allowLiveWebSearch: true }],
  ['schedule', { message: 'Where is my schedule?' }, { mode: 'SULANDRA', allowLiveWebSearch: false }],
  ['current page', { message: 'What is this page?' }, { mode: 'SULANDRA', allowLiveWebSearch: false }],
  ['my work', { message: 'Show my open work and urgent items.' }, { mode: 'SULANDRA', allowLiveWebSearch: false }],
  ['schedule follow-up', {
    message: 'What about tomorrow?',
    recentMessages: [{ role: 'user', content: 'Where is my schedule?' }],
  }, { mode: 'SULANDRA', allowLiveWebSearch: false }],
  ['clinical education', { message: 'What is pneumonia?' }, { mode: 'CLINICAL_SAFE', allowLiveWebSearch: false }],
  ['patient-specific dose', { message: 'Should I repeat this medication dose for my patient?' }, { mode: 'CLINICAL_SAFE', allowLiveWebSearch: false }],
  ['clinical page', { message: 'Help me understand this screen.', page: '/spire/master.html' }, { mode: 'CLINICAL_SAFE', allowLiveWebSearch: false, clinicalPage: true }],
  ['MRN block', { message: 'The patient MRN is AB-12345.' }, { mode: 'CLINICAL_SAFE', blockBeforeModel: true, likelyProtectedData: true }],
  ['DOB block', { message: 'DOB: 04/17/1980 and the chart is wrong.' }, { mode: 'CLINICAL_SAFE', blockBeforeModel: true, likelyProtectedData: true }],
  ['named patient block', { message: 'Patient John Smith needs help.' }, { mode: 'CLINICAL_SAFE', blockBeforeModel: true, likelyProtectedData: true }],
  ['secret block', { message: 'My API key is abcdefghijklmnop.' }, { blockBeforeModel: true, containsSecret: true, allowLiveWebSearch: false }],
  ['clinical screenshot block', { message: 'Why is this loading?', page: '/spire/client-station.html', hasAttachment: true }, { mode: 'CLINICAL_SAFE', blockBeforeModel: true, blockClinicalAttachment: true, allowLiveWebSearch: false }],
  ['general screenshot', { message: 'Explain this diagram.', page: '/sia.html', hasAttachment: true }, { mode: 'GENERAL', blockBeforeModel: false, allowLiveWebSearch: false }],
];

const routerUrl = pathToFileURL(path.join(root, 'api/src/sia-mode-router.ts')).href;
const runner = `import { classifySiaMode } from ${JSON.stringify(routerUrl)};
const inputs = ${JSON.stringify(cases.map(([, input]) => input))};
process.stdout.write(JSON.stringify(inputs.map((input) => classifySiaMode(input))));`;
const { stdout } = await execFileAsync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', runner], {
  cwd: root,
  maxBuffer: 2_000_000,
});
const results = JSON.parse(stdout);
for (let index = 0; index < cases.length; index += 1) {
  const [name, , expected] = cases[index];
  const actual = results[index];
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `${name}: expected ${key}=${JSON.stringify(value)}, received ${JSON.stringify(actual[key])}`);
  }
}

assert.ok(routerSource.includes("allowLiveWebSearch: mode === 'GENERAL'"), 'Only General mode may enable live web search.');
for (const marker of [
  "from './sia-mode-router.js'",
  "routing.mode === 'GENERAL'",
  "routing.mode === 'SULANDRA'",
  "routing.mode === 'CLINICAL_SAFE'",
  "requestBody.tools = [{ type: 'web_search'",
  "requestBody.tool_choice = 'auto'",
  'serverNowUtc',
  'clientLocalDateTime',
  'serverMyWorkOpenCount',
  'CHAT_PRIVACY_BLOCK',
  'BLOCKED_BEFORE_MODEL',
  'url_citation',
  'modeLabel',
  'webSearchUsed',
]) assert.ok(routeSource.includes(marker), `SIA route missing ${marker}`);

assert.ok(routeSource.includes("if (routing.allowLiveWebSearch)"), 'Web search must be guarded by the General-only routing decision.');
assert.ok(routeSource.includes("store: false"), 'Responses must remain non-stored.');
assert.ok(routeSource.includes("routing.mode === 'SULANDRA' && (pageLoadingIntent"), 'Live diagnostics must stay in Sulandra mode.');
assert.ok(routeSource.indexOf('preliminaryRouting.blockBeforeModel') < routeSource.indexOf('storedUserMessage'), 'Privacy blocking must happen before raw user-message persistence.');

for (const [name, source] of [['global copilot', copilotSource], ['standalone SIA', standaloneSource]]) {
  assert.doesNotThrow(() => new Function(source), `${name} has invalid browser JavaScript`);
  for (const marker of ['clientLocalDateTime', 'clientTimeZone', 'clientUtcOffsetMinutes', 'modeLabel']) {
    assert.ok(source.includes(marker), `${name} missing ${marker}`);
  }
}
for (const marker of ['isClinicalPage', 'supportWorkspacePage: location.pathname', 'page: location.pathname', 'siax-mode-badge']) {
  assert.ok(copilotSource.includes(marker), `Global copilot missing ${marker}`);
}
assert.ok(!copilotSource.includes('page: location.pathname+location.search'), 'Global copilot must not send URL query strings.');
for (const marker of ["application: 'SIA support workspace'", 'supportWorkspacePage: location.pathname', 'sia-mode-badge']) {
  assert.ok(standaloneSource.includes(marker), `Standalone SIA missing ${marker}`);
}
assert.ok(copilotCss.includes('.siax-mode-badge'));
assert.ok(standaloneCss.includes('.sia-mode-badge'));
for (const marker of ['Ask SIA anything', 'General, Sulandra, or Clinical-safe', 'Clinical-page screenshots', '20260827-sia-intelligence-router-1']) {
  assert.ok(siaHtml.includes(marker), `SIA HTML missing ${marker}`);
}

console.log('SIA intelligence router verified: automatic modes, General-only web search, time context, privacy preflight, clinical screenshot blocking, cited output support, and UI mode indicators.');
