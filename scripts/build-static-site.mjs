import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const outputDirectory = path.join(
  repositoryRoot,
  'dist-web',
);

const publicDirectories = [
  'assets',
  'courses',
  'education',
  'services',
];

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

const publicRootFiles = new Set([
  'CNAME',
  'vercel.json',
]);

const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';

await rm(outputDirectory, {
  recursive: true,
  force: true,
});

await mkdir(outputDirectory, {
  recursive: true,
});

const entries = await readdir(repositoryRoot, {
  withFileTypes: true,
});

for (const entry of entries) {
  if (!entry.isFile()) {
    continue;
  }

  const extension = path.extname(entry.name).toLowerCase();

  if (
    !publicRootFiles.has(entry.name) &&
    !publicExtensions.has(extension)
  ) {
    continue;
  }

  await cp(
    path.join(repositoryRoot, entry.name),
    path.join(outputDirectory, entry.name),
  );
}

for (const directory of publicDirectories) {
  try {
    await cp(
      path.join(repositoryRoot, directory),
      path.join(outputDirectory, directory),
      { recursive: true },
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const adminPath = path.join(outputDirectory, 'admin.html');
try {
  let adminHtml = await readFile(adminPath, 'utf8');
  const version = '20260805-restored-platform-navigation-2';
  adminHtml = adminHtml.replace(/\s*<script src="admin-restored-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  adminHtml = adminHtml.replace(
    '</body>',
    `  <script src="admin-restored-navigation.js?v=${version}"></script>\n</body>`,
  );
  await writeFile(adminPath, adminHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// The static Railway frontend and API are separate services. The restored
// education portal originally used same-origin /api requests, which caused a
// false authentication failure and redirected signed-in users back to login.
const educationPath = path.join(outputDirectory, 'education-portal.html');
try {
  let educationHtml = await readFile(educationPath, 'utf8');
  educationHtml = educationHtml.replace(
    "const API='',TK='sulandra:employee:access-token',SK='sulandra:employee:session';",
    `const API='${railwayApiBase}',TK='sulandra:employee:access-token',SK='sulandra:employee:session';`,
  );
  await writeFile(educationPath, educationHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const educationEnhancementsPath = path.join(outputDirectory, 'assets', 'education-portal-enhancements.js');
try {
  let educationEnhancements = await readFile(educationEnhancementsPath, 'utf8');
  educationEnhancements = educationEnhancements.replace(
    "const API='',TK='sulandra:employee:access-token';",
    `const API='${railwayApiBase}',TK='sulandra:employee:access-token';`,
  );
  await writeFile(educationEnhancementsPath, educationEnhancements, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(
  'Static website prepared with shared employee authentication across admin, employee, and education portals.',
);
