import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const hotfixPath = path.join(root, 'assets', 'spire-pcp-dedup-hotfix.js');
const profileRuntimePath = path.join(root, 'assets', 'spire-chart-profile-images.js');
const buildStaticPath = path.join(root, 'scripts', 'build-static-site.mjs');
const publishedSyntaxPath = path.join(root, 'scripts', 'verify-published-spire-syntax.mjs');
const HOTFIX_URL = '/assets/spire-pcp-dedup-hotfix.js?v=20260814-pcp-dedup-1';
const PROFILE_FIXED_URL = '/assets/spire-chart-profile-images.js?v=20260814-chart-photo-db-3-dataurl';
const MARKER = 'SPIRE_PCP_CARD_DEDUP_V1';
const PROFILE_DATA_URL_MARKER = 'SPIRE_PROFILE_IMAGE_DATA_URL_V1';

const hotfix = await readFile(hotfixPath, 'utf8');
if (!hotfix.includes(MARKER)) throw new Error(`SPIRE PCP dedup hotfix is missing ${MARKER}`);
if (!hotfix.includes("[data-spire-pcp-photo]{display:none!important}")) throw new Error('SPIRE PCP dedup hotfix does not suppress the retired PCP card');
if (!hotfix.includes("canonicalRows.slice(1)")) throw new Error('SPIRE PCP dedup hotfix does not collapse duplicate canonical PCP rows');

// iPad/iPhone Safari can invalidate or fail to repaint blob: image URLs inside the
// nested SPIRE chart shell after DOM reconciliation. The authenticated API fetch is
// still correct, so convert the returned image Blob to a persistent data: URL before
// assigning it to the chart avatar. This also prevents our own URL.revokeObjectURL
// cleanup from racing a sidebar repaint.
let profileRuntime = await readFile(profileRuntimePath, 'utf8');
if (!profileRuntime.includes(PROFILE_DATA_URL_MARKER)) {
  const revokeAnchor = '  function revokeUrl(kind) {';
  if (!profileRuntime.includes(revokeAnchor)) throw new Error('SPIRE profile runtime revoke anchor is missing');
  const helper = `  // ${PROFILE_DATA_URL_MARKER}\n  function blobDataUrl(blob) {\n    return new Promise((resolve, reject) => {\n      const reader = new FileReader();\n      reader.onerror = () => reject(new Error('Unable to prepare the saved chart photo for display.'));\n      reader.onload = () => {\n        const value = String(reader.result || '');\n        if (!value.startsWith('data:image/')) {\n          reject(new Error('The saved chart photo did not convert to image content.'));\n          return;\n        }\n        resolve(value);\n      };\n      reader.readAsDataURL(blob);\n    });\n  }\n\n`;
  profileRuntime = profileRuntime.replace(revokeAnchor, `${helper}${revokeAnchor}`);
}

profileRuntime = profileRuntime.replace(
  '    if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);',
  "    if (slot.objectUrl && slot.objectUrl.startsWith('blob:')) URL.revokeObjectURL(slot.objectUrl);",
);
profileRuntime = profileRuntime.replace(
  '    slot.objectUrl = URL.createObjectURL(blob);',
  '    slot.objectUrl = await blobDataUrl(blob);',
);

const clientImageRule = '#avatarDisplay > img[data-spire-durable-client-photo="1"]{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important;display:block!important}';
if (!profileRuntime.includes(clientImageRule)) {
  const styleAnchor = '      #avatarDisplay[data-spire-durable-client-photo="1"]{object-fit:cover!important;object-position:center!important}';
  if (!profileRuntime.includes(styleAnchor)) throw new Error('SPIRE durable avatar style anchor is missing');
  profileRuntime = profileRuntime.replace(styleAnchor, `${styleAnchor}\n      ${clientImageRule}`);
}

if (!profileRuntime.includes(PROFILE_DATA_URL_MARKER)) throw new Error('SPIRE Safari-safe chart-photo marker was not installed');
if (!profileRuntime.includes('slot.objectUrl = await blobDataUrl(blob);')) throw new Error('SPIRE chart photos still use transient blob URLs');
if (profileRuntime.includes('slot.objectUrl = URL.createObjectURL(blob);')) throw new Error('SPIRE transient blob URL renderer is still active');
if (!profileRuntime.includes("slot.objectUrl && slot.objectUrl.startsWith('blob:')")) throw new Error('SPIRE profile URL cleanup is not data-URL safe');
if (!profileRuntime.includes(clientImageRule)) throw new Error('SPIRE client avatar child image sizing rule is missing');
await writeFile(profileRuntimePath, profileRuntime, 'utf8');

let master = await readFile(masterPath, 'utf8');
master = master.replace(/\s*<script\s+src=["']\/assets\/spire-pcp-dedup-hotfix\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
master = master.replace(/\/assets\/spire-chart-profile-images\.js\?v=[^"']+/g, PROFILE_FIXED_URL);
if (!master.includes('</body>')) throw new Error('SPIRE master is missing </body>');
master = master.replace('</body>', `  <script src="${HOTFIX_URL}"></script>\n</body>`);
await writeFile(masterPath, master, 'utf8');

// The publication verifier receives the cache-busted profile asset URL from the
// earlier MAR publication pass. Keep its expected URL aligned with the Safari-safe
// runtime URL that this final hotfix publishes.
for (const verifierPath of [buildStaticPath, publishedSyntaxPath]) {
  let source = await readFile(verifierPath, 'utf8');
  source = source.replace(/\/assets\/spire-chart-profile-images\.js\?v=20260814-chart-photo-db-2/g, PROFILE_FIXED_URL);
  await writeFile(verifierPath, source, 'utf8');
}

const pcpCount = (master.match(/\/assets\/spire-pcp-dedup-hotfix\.js\?v=/g) || []).length;
if (pcpCount !== 1) throw new Error(`SPIRE master must publish the PCP dedup hotfix exactly once; found ${pcpCount}`);
const profileCount = (master.match(/\/assets\/spire-chart-profile-images\.js\?v=/g) || []).length;
if (profileCount !== 1) throw new Error(`SPIRE master must publish the chart profile runtime exactly once; found ${profileCount}`);
if (!master.includes(PROFILE_FIXED_URL)) throw new Error('SPIRE master did not publish the Safari-safe chart profile image runtime');

console.log(`SPIRE PCP provider card deduplication remains active via ${HOTFIX_URL}. Chart profile photos now render from authenticated image bytes as persistent data URLs via ${PROFILE_FIXED_URL}, avoiding Safari/nested-frame blob URL invalidation while keeping PostgreSQL as the patient-scoped source of truth.`);
