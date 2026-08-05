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
  const version = '20260805-restored-platform-navigation-1';
  adminHtml = adminHtml.replace(/\s*<script src="admin-restored-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  adminHtml = adminHtml.replace(
    '</body>',
    `  <script src="admin-restored-navigation.js?v=${version}"></script>\n</body>`,
  );
  await writeFile(adminPath, adminHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(
  'Static website prepared in dist-web with restored intranet, education, employee, service, and admin navigation routes.',
);
