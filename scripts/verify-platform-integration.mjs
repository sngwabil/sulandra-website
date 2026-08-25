import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const dist = path.join(root, 'dist-web');

const requiredFiles = [
  'index.html',
  'services.html',
  'resources.html',
  'service-request.html',
  'intranet.html',
  'employee-login.html',
  'employee-portal.html',
  'admin.html',
  'employee360.html',

  // SPIRE canonical entry + standalone application
  'spire.html',
  'spire/master.html',
  'spire-admin.html',

  'applicant-portal.html',
  'education-portal.html',
  'time-attendance.html',
  'policies.html',
  'news.html',
  'feedback.html',
  'payroll.html',
  'benefits.html',
  'employee-directory.html',
  'leadership.html',
  'support.html',
  'health-safety.html',
  'intranet-control.html',
  'favicon-48x48.png',
  'assets/mainlogo.png',

  'services/community-living/index.html',
  'services/community-living/admin-dashboard.html',
  'services/community-living/profile.html',

  'services/home-health/index.html',
  'services/transportation/index.html',
  'services/respite-care/index.html',
  'services/rehab/index.html',
  'services/behavioral-health/index.html',
  'services/companion-care/index.html',

  'assets/intranet-live-integration.js',
  'assets/intranet-content-app.js',
  'assets/intranet-control-app.js',
  'assets/employee-portal-deep-integration.js',

  'assets/policies-app.js',
  'assets/news-app.js',
  'assets/feedback-app.js',
  'assets/payroll-app.js',
  'assets/benefits-app.js',
  'assets/employee-directory-app.js',
  'assets/support-app.js',
  'assets/health-safety-app.js',

  'assets/client-service-request-app.js',
  'assets/admin-client-service-requests.js',
  'assets/public-consultation-service-request-bridge.js',
  'assets/public-services-navigation.js',

  'assets/admin-shell.js',
  'assets/admin-shell.css',
  'assets/admin-company-context.js',
  'assets/admin-service-home-management-v2.js',
  'assets/time-attendance-route-restore.js',
  'assets/employee360-hash-routing.js',
];

const requiredDirectories = [
  'services',
  'spire',
];

const cleanRoutes = [
  'policies',
  'documents',
  'news',
  'feedback',
  'payroll',
  'benefits',
  'employee-directory',
  'leadership',
  'support',
  'it-request',
  'time-attendance',
  'scheduling',
  'incident-reporting',
  'health-safety',
  'service-request',
  'resources',
];

const forbiddenBackendHtml =
  /href=["']https:\/\/sulandra-website-production-5fc4\.up\.railway\.app\/(?!api\/|public\/)/i;

const knownDeadRoutes = [
  '/policies',
  '/documents',
  '/news',
  '/feedback',
  '/payroll',
  '/benefits',
  '/employee-directory',
  '/leadership',
  '/support',
  '/it-request',
  '/scheduling',
  '/time-attendance',
  '/incident-reporting',
  '/health-safety',
  '/caregiver-resources',
  '/about',
  '/services/community-living',
  '/services/waiver',
];

const canonicalApi =
  'https://sulandra-website-production-5fc4.up.railway.app';

const staleApi =
  'https://sulandra-website-production.up.railway.app';

const failures = [];

/*
 * --------------------------------------------------------------------------
 * Required published files
 * --------------------------------------------------------------------------
 */

for (const relative of requiredFiles) {
  try {
    await stat(path.join(dist, relative));
  } catch {
    failures.push(
      `Missing published file: ${relative}`
    );
  }
}

/*
 * --------------------------------------------------------------------------
 * Required published directories
 * --------------------------------------------------------------------------
 */

for (const relative of requiredDirectories) {
  try {
    const published = await stat(
      path.join(dist, relative)
    );

    if (!published.isDirectory()) {
      failures.push(
        `Published path is not a directory: ${relative}`
      );
    }
  } catch {
    failures.push(
      `Missing published directory: ${relative}`
    );
  }
}

/*
 * --------------------------------------------------------------------------
 * Clean route fallbacks
 * --------------------------------------------------------------------------
 */

for (const route of cleanRoutes) {
  try {
    await stat(
      path.join(
        dist,
        route,
        'index.html'
      )
    );
  } catch {
    failures.push(
      `Missing clean-route fallback: /${route}`
    );
  }
}

/*
 * --------------------------------------------------------------------------
 * HTML crawler
 * --------------------------------------------------------------------------
 */

async function walk(directory) {
  const files = [];

  for (
    const entry of await readdir(
      directory,
      { withFileTypes: true }
    )
  ) {
    const target = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...await walk(target)
      );
    } else if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith('.html')
    ) {
      files.push(target);
    }
  }

  return files;
}

/*
 * --------------------------------------------------------------------------
 * Prevent frontend HTML from navigating to backend host
 * --------------------------------------------------------------------------
 */

for (const file of await walk(dist)) {
  const html =
    await readFile(file, 'utf8');

  const rel =
    path.relative(dist, file);

  if (
    forbiddenBackendHtml.test(html)
  ) {
    failures.push(
      `${rel} links to the backend service as an HTML destination`
    );
  }

  for (
    const route of knownDeadRoutes
  ) {
    const escaped =
      route.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

    if (
      new RegExp(
        `href=(['"])${escaped}\\1`
      ).test(html)
    ) {
      failures.push(
        `${rel} still contains unresolved route ${route}`
      );
    }
  }
}

/*
 * --------------------------------------------------------------------------
 * Canonical Admin navigation
 * --------------------------------------------------------------------------
 */

try {
  const admin = await readFile(path.join(dist, 'admin.html'), 'utf8');
  const context = await readFile(path.join(dist, 'assets/admin-company-context.js'), 'utf8');
  const registry = await readFile(path.join(dist, 'assets/admin-navigation-registry.js'), 'utf8');

  for (const marker of [
    '/assets/admin-navigation-registry.js?v=20260825-admin-ia-1',
    '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
  ]) {
    if (!admin.includes(marker)) failures.push(`Admin does not load canonical runtime ${marker}`);
  }

  const serviceHomeAsset = "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'";
  if (!context.includes(serviceHomeAsset)) {
    failures.push(`Canonical Admin bootstrap is missing ${serviceHomeAsset}`);
  }

  for (const route of [
    '/intranet.html',
    '/employee-portal.html',
    '/employee360.html',
    '/education-portal.html',
    '/spire.html',
    '/spire/master.html',
    '/scheduling.html',
    '/time-attendance.html#admin',
    '/spire-admin.html',
  ]) {
    if (!registry.includes(route)) {
      failures.push(`Canonical Admin route registry is missing ${route}`);
    }
  }

  if (!context.includes('const REGISTRY = window.SulandraAdminRouteRegistry')) {
    failures.push('Admin company context does not consume the canonical route registry');
  }
  if (context.includes('admin-platform-routing.js')) {
    failures.push('Admin still relies on the legacy runtime route patcher');
  }
} catch (error) {
  failures.push(`Canonical Admin navigation verification could not complete: ${error instanceof Error ? error.message : error}`);
}

/*
 * --------------------------------------------------------------------------
 * Employee Portal
 * --------------------------------------------------------------------------
 */

try {
  const employeePortal =
    await readFile(
      path.join(
        dist,
        'employee-portal.html'
      ),
      'utf8'
    );

  if (
    !employeePortal.includes(
      '/assets/employee-portal-deep-integration.js'
    )
  ) {
    failures.push(
      'Employee Portal does not load the live-module integration bridge'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * SPIRE standalone architecture
 * --------------------------------------------------------------------------
 */

try {
  const spireEntry =
    await readFile(
      path.join(
        dist,
        'spire.html'
      ),
      'utf8'
    );

  const spireMaster =
    await readFile(
      path.join(
        dist,
        'spire',
        'master.html'
      ),
      'utf8'
    );

  /*
   * Root /spire.html must be the canonical redirect only.
   */
  if (
    !spireEntry.includes(
      '/spire/master.html'
    )
  ) {
    failures.push(
      'Canonical /spire.html does not route to /spire/master.html'
    );
  }

  if (
    !spireEntry.includes(
      'window.location.search'
    ) ||
    !spireEntry.includes(
      'window.location.hash'
    )
  ) {
    failures.push(
      'Canonical SPIRE entry does not preserve query/hash deep-link context'
    );
  }

  /*
   * Master must be a complete standalone HTML application.
   */
  if (
    !/<html[\s>]/i.test(spireMaster) ||
    !/<head[\s>]/i.test(spireMaster) ||
    !/<body[\s>]/i.test(spireMaster) ||
    !/<\/html>/i.test(spireMaster)
  ) {
    failures.push(
      'Standalone /spire/master.html is not a complete HTML application'
    );
  }

  /*
   * Old root SPIRE shell must not execute anymore.
   */
  const forbiddenLegacyEntryAssets = [
    'spire-app-v2.js',
    'spire-canonical-bootstrap.js',
    'spire-shell-resilience.js',
    'spire-chart-ready.js',
    'spire-deep-link.js',
    'spire-home-care-redesign-loader.js',
  ];

  for (
    const asset of
      forbiddenLegacyEntryAssets
  ) {
    if (
      spireEntry.includes(asset)
    ) {
      failures.push(
        `Canonical /spire.html still loads legacy SPIRE runtime asset ${asset}`
      );
    }
  }

  /*
   * Master should not contain legacy/demo fallback content.
   */
  if (
    spireMaster.includes(
      'S.P.I.R.E. Employee Access'
    ) ||
    spiresDemo(spireMaster)
  ) {
    failures.push(
      'SPIRE master contains demo fallback behavior'
    );
  }
} catch (error) {
  failures.push(
    `SPIRE standalone frontend verification could not complete: ${
      error instanceof Error
        ? error.message
        : error
    }`
  );
}

/*
 * --------------------------------------------------------------------------
 * SPIRE Administration
 * --------------------------------------------------------------------------
 */

try {
  const spireAdmin =
    await readFile(
      path.join(
        dist,
        'spire-admin.html'
      ),
      'utf8'
    );

  /*
   * Current SPIRE Administration already launches the master directly.
   */
  const hasLiveSpireLink =
    spireAdmin.includes(
      '/spire/master.html'
    ) ||
    spireAdmin.includes(
      '/spire.html'
    );

  /*
   * Preserve the Sulandra platform boundary.
   *
   * Current page contains both Enterprise Apps and Admin Console links.
   */
  const hasPlatformReturn =
    spireAdmin.includes(
      '/enterprise-apps.html'
    ) ||
    spireAdmin.includes(
      '/admin.html#dashboard'
    );

  if (
    !hasLiveSpireLink ||
    !hasPlatformReturn
  ) {
    failures.push(
      'Spire Admin does not preserve the Sulandra platform boundary'
    );
  }

  if (
    spireAdmin.includes(staleApi) ||
    spiresDemo(spireAdmin)
  ) {
    failures.push(
      'Spire Admin contains stale API or demo fallback behavior'
    );
  }
} catch (error) {
  failures.push(
    `Spire Admin verification could not complete: ${
      error instanceof Error
        ? error.message
        : error
    }`
  );
}

/*
 * --------------------------------------------------------------------------
 * Education Portal
 * --------------------------------------------------------------------------
 */

try {
  const education =
    await readFile(
      path.join(
        dist,
        'education-portal.html'
      ),
      'utf8'
    );

  if (
    !education.includes(
      '/assets/mainlogo.png'
    )
  ) {
    failures.push(
      'Education Portal does not publish the Sulandra Health logo'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Time & Attendance
 * --------------------------------------------------------------------------
 */

try {
  const time =
    await readFile(
      path.join(
        dist,
        'time-attendance.html'
      ),
      'utf8'
    );

  if (
    !time.includes(
      canonicalApi
    )
  ) {
    failures.push(
      'Time & Attendance is not using the canonical Railway API'
    );
  }

  if (
    !time.includes(
      '/assets/time-attendance-route-restore.js'
    )
  ) {
    failures.push(
      'Time & Attendance deep-link restoration is missing'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Employee 360
 * --------------------------------------------------------------------------
 */

try {
  const employee360 =
    await readFile(
      path.join(
        dist,
        'employee360.html'
      ),
      'utf8'
    );

  if (
    !employee360.includes(
      '/assets/employee360-hash-routing.js'
    )
  ) {
    failures.push(
      'Employee 360 deep-link routing is missing'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Public homepage
 * --------------------------------------------------------------------------
 */

try {
  const index =
    await readFile(
      path.join(
        dist,
        'index.html'
      ),
      'utf8'
    );

  if (
    !index.includes(
      '/assets/public-consultation-service-request-bridge.js'
    )
  ) {
    failures.push(
      'Public homepage consultation is not connected to Client Service Requests'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Services page
 * --------------------------------------------------------------------------
 */

try {
  const services =
    await readFile(
      path.join(
        dist,
        'services.html'
      ),
      'utf8'
    );

  if (
    !services.includes(
      '/assets/public-services-navigation.js'
    )
  ) {
    failures.push(
      'Services page does not load live public navigation'
    );
  }

  for (
    const label of [
      'Reviews',
      'Resources',
      'Free Consultation',
      'About Us',
      'Careers',
      'Contact',
      'View All Services',
    ]
  ) {
    if (
      new RegExp(
        `<a href="#"[^>]*>${label}<\\/a>`
      ).test(services)
    ) {
      failures.push(
        `Services page still has placeholder link: ${label}`
      );
    }
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Applicant Portal
 * --------------------------------------------------------------------------
 */

try {
  const applicant =
    await readFile(
      path.join(
        dist,
        'applicant-portal.html'
      ),
      'utf8'
    );

  if (
    !applicant.includes(
      canonicalApi
    )
  ) {
    failures.push(
      'Applicant Portal is not using the canonical Railway API'
    );
  }

  if (
    applicant.includes(
      staleApi
    )
  ) {
    failures.push(
      'Applicant Portal still references the retired Railway API host'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Legacy Community Living administration redirect
 * --------------------------------------------------------------------------
 */

try {
  const legacyAdmin =
    await readFile(
      path.join(
        dist,
        'services/community-living/admin-dashboard.html'
      ),
      'utf8'
    );

  if (
    !legacyAdmin.includes(
      '/admin.html#onboarding'
    )
  ) {
    failures.push(
      'Legacy Community Living admin dashboard does not route to unified Admin'
    );
  }

  if (
    legacyAdmin.includes(
      'John Doe'
    ) ||
    legacyAdmin.includes(
      'Sarah Smith'
    )
  ) {
    failures.push(
      'Legacy Community Living admin dashboard still contains demo applicant data'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Legacy Community Living profile redirect
 * --------------------------------------------------------------------------
 */

try {
  const legacyProfile =
    await readFile(
      path.join(
        dist,
        'services/community-living/profile.html'
      ),
      'utf8'
    );

  if (
    !legacyProfile.includes(
      '/applicant-portal.html'
    )
  ) {
    failures.push(
      'Legacy Community Living candidate profile does not route to the secure Applicant Portal'
    );
  }

  if (
    legacyProfile.includes(
      "alert('Profile Found!"
    )
  ) {
    failures.push(
      'Legacy Community Living candidate profile still contains demo authentication'
    );
  }
} catch {}

/*
 * --------------------------------------------------------------------------
 * Demo-content detector
 * --------------------------------------------------------------------------
 */

function spiresDemo(source) {
  return (
    source.includes('Demo Employee') ||
    source.includes('Demo Client') ||
    source.includes('Endpoint pending')
  );
}

/*
 * --------------------------------------------------------------------------
 * Final result
 * --------------------------------------------------------------------------
 */

if (failures.length) {
  console.error(
    'Platform integration verification failed:\n- ' +
    failures.join('\n- ')
  );

  process.exit(1);
}

console.log(
  [
    'Platform integration verified:',
    'canonical Admin navigation owns platform destinations,',
    'SPIRE uses the standalone /spire/master.html workstation,',
    '/spire.html remains the canonical redirect entry,',
    'and public/employee/clinical services retain correct frontend/backend ownership.',
  ].join(' ')
);

