import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const publicDirectories = ['assets', 'courses', 'education', 'services'];
const publicExtensions = new Set([
  '.css',
  '.html',
  '.ico',
  '.js',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const publicRootFiles = new Set(['CNAME', 'vercel.json']);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const entries = await readdir(repositoryRoot, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const extension = path.extname(entry.name).toLowerCase();
  if (!publicRootFiles.has(entry.name) && !publicExtensions.has(extension)) continue;

  await cp(
    path.join(repositoryRoot, entry.name),
    path.join(outputDirectory, entry.name),
  );
}

for (const directory of publicDirectories) {
  await cp(
    path.join(repositoryRoot, directory),
    path.join(outputDirectory, directory),
    { recursive: true },
  );
}

// S.P.I.R.E. production entry: publish the Sulandra-native care workstation
// at the existing clinical URL so employee portal links do not change.
await cp(
  path.join(repositoryRoot, 'spire-care-workstation.html'),
  path.join(outputDirectory, 'spire-clinical.html'),
);

const adminPortalPath = path.join(outputDirectory, 'admin.html');
let adminPortal = await readFile(adminPortalPath, 'utf8');

const topOnboardingLink = '        <li><a data-module="onboarding">Onboarding</a></li>';
const topSpireLink = '        <li><a href="spire-admin.html">Admin Spire</a></li>\n';
if (!adminPortal.includes('href="spire-admin.html">Admin Spire</a>')) {
  adminPortal = adminPortal.replace(topOnboardingLink, `${topSpireLink}${topOnboardingLink}`);
}

const sideOnboardingButton = '          <button class="side-btn" type="button" data-module="onboarding">Onboarding <small>Hiring</small></button>';
const sideSpireLink = '          <a class="side-btn" href="spire-admin.html" style="text-decoration:none;">Admin Spire <small>Clinical</small></a>\n';
if (!adminPortal.includes('Admin Spire <small>Clinical</small>')) {
  adminPortal = adminPortal.replace(sideOnboardingButton, `${sideSpireLink}${sideOnboardingButton}`);
}

const deploymentVersion = '20260812-spire-care-workstation-1';
adminPortal = adminPortal.replace(
  /careers-admin-workflow\.js(?:\?v=[^"']+)?/g,
  `careers-admin-workflow.js?v=${deploymentVersion}`,
);
adminPortal = adminPortal.replace(
  /admin-railway\.js(?:\?v=[^"']+)?/g,
  `admin-railway.js?v=${deploymentVersion}`,
);

const runtimeScripts = [
  `  <script src="offer-only-runtime.js?v=${deploymentVersion}"></script>`,
  `  <script src="admin-onboarding-enhancements.js?v=${deploymentVersion}"></script>`,
].join('\n') + '\n';
adminPortal = adminPortal.replace(/\s*<script src="offer-only-runtime\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
adminPortal = adminPortal.replace(/\s*<script src="admin-onboarding-enhancements\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
adminPortal = adminPortal.replace('</body>', `${runtimeScripts}</body>`);

await writeFile(adminPortalPath, adminPortal, 'utf8');

console.log(`Static website prepared in ${outputDirectory}`);
