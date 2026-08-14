import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const clientStationPath = path.join(root, 'spire', 'client-station.html');
const hotfixPath = path.join(root, 'assets', 'spire-pcp-dedup-hotfix.js');
const profileRuntimePath = path.join(root, 'assets', 'spire-chart-profile-images.js');
const clientPhotoRuntimePath = path.join(root, 'assets', 'spire-client-photo-display.js');
const buildStaticPath = path.join(root, 'scripts', 'build-static-site.mjs');
const publishedSyntaxPath = path.join(root, 'scripts', 'verify-published-spire-syntax.mjs');
const HOTFIX_URL = '/assets/spire-pcp-dedup-hotfix.js?v=20260814-pcp-dedup-1';
const PROFILE_FIXED_URL = '/assets/spire-chart-profile-images.js?v=20260814-chart-photo-db-3-dataurl';
const CLIENT_PHOTO_URL = '/assets/spire-client-photo-display.js?v=20260814-client-photo-display-1';
const MARKER = 'SPIRE_PCP_CARD_DEDUP_V1';
const PROFILE_DATA_URL_MARKER = 'SPIRE_PROFILE_IMAGE_DATA_URL_V1';
const CLIENT_PHOTO_MARKER = 'SPIRE_CLIENT_PHOTO_DISPLAY_V1';
const CLIENT_IDENTIFICATION_STYLE_ID = 'spire-client-identification-size-v1';
const CLIENT_IDENTIFICATION_STYLE = `<style id="${CLIENT_IDENTIFICATION_STYLE_ID}">
  /* SPIRE_CLIENT_IDENTIFICATION_SIZE_V1 — presentation only; no MAR/eMAR behavior. */
  .client-avatar-box{min-height:108px!important;padding:10px!important;gap:14px!important;align-items:center!important;background:linear-gradient(135deg,#f8fdff,#edf8fc)!important;border:1px solid #b8d7e5!important;border-bottom:3px solid #28a7d5!important;border-radius:7px!important;box-shadow:0 2px 7px rgba(14,84,116,.10)!important}
  .client-avatar-box #avatarDisplay{width:82px!important;height:82px!important;min-width:82px!important;max-width:82px!important;flex:0 0 82px!important;aspect-ratio:1/1!important;border-radius:50%!important;object-fit:cover!important;object-position:center!important;border:3px solid #fff!important;outline:2px solid #7eb9d1!important;box-shadow:0 3px 10px rgba(15,74,101,.20)!important;background:#dceef7!important}
  .client-avatar-box .client-name-block{min-width:0!important;line-height:1.18!important}
  .client-avatar-box .client-name-block h2{font-size:15.5px!important;font-weight:800!important;color:#075f86!important;line-height:1.18!important;margin-bottom:3px!important}
  .client-avatar-box .client-name-block span,.client-avatar-box .client-name-block div{font-size:12px!important}
  .client-photo[data-spire-client-photo="1"]{width:44px!important;height:44px!important;min-width:44px!important;flex:0 0 44px!important;border:2px solid #fff!important;outline:1px solid #87b6c8!important;box-shadow:0 1px 4px rgba(14,84,116,.16)!important}
  .client-cell{grid-template-columns:48px minmax(0,1fr)!important;gap:8px!important}
  .client-row td{height:56px!important}
  .spire-client-preview-photo{width:46px!important;height:46px!important;min-width:46px!important;border:2px solid #fff!important;outline:1px solid #87b6c8!important;box-shadow:0 1px 4px rgba(14,84,116,.16)!important}
</style>`;

const hotfix = await readFile(hotfixPath, 'utf8');
if (!hotfix.includes(MARKER)) throw new Error(`SPIRE PCP dedup hotfix is missing ${MARKER}`);
if (!hotfix.includes("[data-spire-pcp-photo]{display:none!important}")) throw new Error('SPIRE PCP dedup hotfix does not suppress the retired PCP card');
if (!hotfix.includes("canonicalRows.slice(1)")) throw new Error('SPIRE PCP dedup hotfix does not collapse duplicate canonical PCP rows');

const clientPhotoRuntime = await readFile(clientPhotoRuntimePath, 'utf8');
if (!clientPhotoRuntime.includes(CLIENT_PHOTO_MARKER)) throw new Error(`SPIRE client photo runtime is missing ${CLIENT_PHOTO_MARKER}`);
if (!clientPhotoRuntime.includes('stationClientBody')) throw new Error('SPIRE client photo runtime does not decorate Client Station');
if (!clientPhotoRuntime.includes('#avatarDisplay')) throw new Error('SPIRE client photo runtime does not protect the chart avatar');
if (clientPhotoRuntime.includes("document.querySelector('#mar-view')") || clientPhotoRuntime.includes('/emar/events') || clientPhotoRuntime.includes('data-mar-')) {
  throw new Error('SPIRE client photo display runtime must remain isolated from MAR/eMAR internals');
}

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
master = master.replace(/\s*<script\s+src=["']\/assets\/spire-client-photo-display\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
master = master.replace(new RegExp(`\\s*<style id=["']${CLIENT_IDENTIFICATION_STYLE_ID}["'][\\s\\S]*?<\\/style>\\s*`, 'gi'), '\n');
master = master.replace(/\/assets\/spire-chart-profile-images\.js\?v=[^"']+/g, PROFILE_FIXED_URL);
if (!master.includes('</body>')) throw new Error('SPIRE master is missing </body>');
master = master.replace('</body>', `  ${CLIENT_IDENTIFICATION_STYLE}\n  <script src="${CLIENT_PHOTO_URL}"></script>\n  <script src="${HOTFIX_URL}"></script>\n</body>`);
await writeFile(masterPath, master, 'utf8');

let clientStation = await readFile(clientStationPath, 'utf8');
clientStation = clientStation.replace(/\s*<script\s+src=["']\/assets\/spire-client-photo-display\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
clientStation = clientStation.replace(new RegExp(`\\s*<style id=["']${CLIENT_IDENTIFICATION_STYLE_ID}["'][\\s\\S]*?<\\/style>\\s*`, 'gi'), '\n');
if (!clientStation.includes('</body>')) throw new Error('SPIRE Client Station is missing </body>');
clientStation = clientStation.replace('</body>', `  ${CLIENT_IDENTIFICATION_STYLE}\n  <script src="${CLIENT_PHOTO_URL}"></script>\n</body>`);
await writeFile(clientStationPath, clientStation, 'utf8');

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
const masterClientPhotoCount = (master.match(/\/assets\/spire-client-photo-display\.js\?v=/g) || []).length;
if (masterClientPhotoCount !== 1) throw new Error(`SPIRE master must publish the isolated client photo runtime exactly once; found ${masterClientPhotoCount}`);
const stationClientPhotoCount = (clientStation.match(/\/assets\/spire-client-photo-display\.js\?v=/g) || []).length;
if (stationClientPhotoCount !== 1) throw new Error(`SPIRE Client Station must publish the isolated client photo runtime exactly once; found ${stationClientPhotoCount}`);
if (!master.includes(`id="${CLIENT_IDENTIFICATION_STYLE_ID}"`)) throw new Error('SPIRE chart is missing the enlarged client identification style');
if (!clientStation.includes(`id="${CLIENT_IDENTIFICATION_STYLE_ID}"`)) throw new Error('SPIRE Client Station is missing the enlarged client identification style');

console.log(`SPIRE PCP provider card deduplication remains active via ${HOTFIX_URL}. Chart profile photos continue using the existing Safari-safe runtime ${PROFILE_FIXED_URL}. The isolated patient photo display runtime ${CLIENT_PHOTO_URL} remains separate from MAR/eMAR, while ${CLIENT_IDENTIFICATION_STYLE_ID} enlarges client photos for faster visual identification in the chart and Client Station.`);
