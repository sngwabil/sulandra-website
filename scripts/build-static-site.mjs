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
  const version = '20260805-applicant-lifecycle-filter-1';
  adminHtml = adminHtml.replace(/\s*<script src="admin-restored-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  adminHtml = adminHtml.replace(/\s*<script src="admin-applicant-lifecycle-filter\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  adminHtml = adminHtml.replace(
    '</body>',
    `  <script src="admin-restored-navigation.js?v=${version}"></script>\n  <script src="admin-applicant-lifecycle-filter.js?v=${version}"></script>\n</body>`,
  );
  await writeFile(adminPath, adminHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

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

const timeAttendancePath = path.join(outputDirectory, 'time-attendance.html');
try {
  let timeAttendanceHtml = await readFile(timeAttendancePath, 'utf8');
  timeAttendanceHtml = timeAttendanceHtml.replace(
    "const API=(localStorage.getItem('sulandra_api_url')||window.SULANDRA_API_URL||'').replace(/\\/$/,'');",
    `const API=(localStorage.getItem('sulandra_api_url')||window.SULANDRA_API_URL||'${railwayApiBase}').replace(/\\/$/,'');`,
  );
  await writeFile(timeAttendancePath, timeAttendanceHtml, 'utf8');

  const cleanRouteDirectory = path.join(outputDirectory, 'time-attendance');
  await mkdir(cleanRouteDirectory, { recursive: true });
  await writeFile(path.join(cleanRouteDirectory, 'index.html'), timeAttendanceHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await rm(path.join(outputDirectory, 'time-attendance.txt'), { force: true });

console.log(
  'Static website prepared with shared employee authentication, corrected applicant lifecycle lists, and Time and Attendance frontend routing.',
);
