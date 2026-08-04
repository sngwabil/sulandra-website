import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'interview-scheduling.html');
const routePath = path.join(root, 'api', 'src', 'public-interview-page-route.ts');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');

const page = await readFile(pagePath, 'utf8');
const routeSource = `import type express from 'express';

const interviewSchedulingPage = ${JSON.stringify(page)};

export function registerPublicInterviewPageRoute(app: express.Express) {
  app.get('/interview-scheduling.html', (_request, response) => {
    response
      .status(200)
      .type('html')
      .set('Cache-Control', 'no-store, max-age=0')
      .send(interviewSchedulingPage);
  });
}
`;
await writeFile(routePath, routeSource, 'utf8');

let bootstrap = await readFile(bootstrapPath, 'utf8');
const importLine = "import { registerPublicInterviewPageRoute } from './public-interview-page-route.js';";
if (!bootstrap.includes(importLine)) {
  bootstrap = bootstrap.replace(
    "import { registerCareersRoutes } from './careers-routes.js';",
    "import { registerCareersRoutes } from './careers-routes.js';\n" + importLine,
  );
}
const registrationLine = 'registerPublicInterviewPageRoute(app);';
if (!bootstrap.includes(registrationLine)) {
  bootstrap = bootstrap.replace(
    'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });',
    registrationLine + '\nregisterCareersRoutes(app, prisma, { authOf, requireRoles, audit });',
  );
}
await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Public interview scheduling page route installed.');
