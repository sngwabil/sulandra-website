import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const contract = '20260810-business-uat-1';
const homeHealthRailGeneration = '20260810-home-health-rail-stability-2';

const canonicalApi =
  'https://sulandra-website-production-5fc4.up.railway.app';

const staleApi =
  'https://sulandra-website-production.up.railway.app';

const skippedFrontendSources = [];

async function update(relative, transform) {
  const target = path.join(root, relative);

  let source;

  try {
    source = await readFile(target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      skippedFrontendSources.push(relative);
      return false;
    }

    throw error;
  }

  const next = transform(source);

  if (next !== source) {
    await writeFile(target, next, 'utf8');
  }

  return true;
}

/*
 * --------------------------------------------------------------------------
 * Canonical Railway API normalization
 * --------------------------------------------------------------------------
 */

for (const relative of [
  'applydsp.html',
  'interview-admin-scheduler.js',
  'applicant-portal.html',
  'offer-acceptance.html',
]) {
  await update(relative, source => {
    const next = source.replaceAll(
      staleApi,
      canonicalApi
    );

    if (
      !next.includes(canonicalApi) ||
      next.includes(staleApi)
    ) {
      throw new Error(
        `${relative} is not pinned to the canonical Railway API`
      );
    }

    return next;
  });
}

/*
 * --------------------------------------------------------------------------
 * Home Health secure referral invitation bootstrap
 * --------------------------------------------------------------------------
 */

await update('home-health-referral.html', source => {
  if (
    source.includes(
      'home-health-referral-token-bootstrap.js'
    )
  ) {
    return source;
  }

  const marker = '<script>(()=>';

  if (!source.includes(marker)) {
    throw new Error(
      'Home Health referral bootstrap anchor is missing'
    );
  }

  const next = source.replace(
    marker,
    `<script src="/assets/home-health-referral-token-bootstrap.js?v=${contract}"></script>${marker}`
  );

  if (
    !next.includes(
      'home-health-referral-token-bootstrap.js'
    )
  ) {
    throw new Error(
      'Home Health secure invitation token bootstrap was not installed'
    );
  }

  return next;
});

/*
 * --------------------------------------------------------------------------
 * Home Health operations navigation + rail stability
 * --------------------------------------------------------------------------
 */

await update('home-health.html', source => {
  let next = source;

  if (
    !next.includes(
      'id="homeHealthReferralInboxLink"'
    )
  ) {
    const marker =
      '<a href="/home-health-visits.html">My Visits</a>';

    if (!next.includes(marker)) {
      throw new Error(
        'Home Health header navigation anchor is missing'
      );
    }

    next = next.replace(
      marker,
      `<a id="homeHealthReferralInboxLink" data-business-uat-contract="${contract}" href="/home-health-referrals.html">Referral Inbox</a>${marker}`
    );
  }

  if (
    next.includes(
      'home-health-rail-stability.js'
    )
  ) {
    next = next.replace(
      /\/assets\/home-health-rail-stability\.js(?:\?v=[^"']+)?/g,
      `/assets/home-health-rail-stability.js?v=${homeHealthRailGeneration}`
    );
  } else {
    if (!next.includes('</body>')) {
      throw new Error(
        'Home Health page has no body close'
      );
    }

    next = next.replace(
      '</body>',
      `<script src="/assets/home-health-rail-stability.js?v=${homeHealthRailGeneration}"></script>
</body>`
    );
  }

  if (
    !next.includes(
      'href="/home-health-referrals.html"'
    )
  ) {
    throw new Error(
      'Home Health Operations to Referral Inbox workflow bridge was not installed'
    );
  }

  if (
    !next.includes(
      `/assets/home-health-rail-stability.js?v=${homeHealthRailGeneration}`
    )
  ) {
    throw new Error(
      'Home Health rail stability bridge was not pinned to generation two'
    );
  }

  return next;
});

/*
 * --------------------------------------------------------------------------
 * Employee Portal → Home Health Referral Inbox
 * --------------------------------------------------------------------------
 */

await update(
  'employee-portal-railway.js',
  source => {
    if (
      source.includes(
        'employeeHomeHealthReferralInboxLauncher'
      )
    ) {
      return source;
    }

    const marker =
      '          quick.appendChild(launcher("Home Health Operations", "/home-health.html", "Manage Home Health referrals, episodes, Plan of Care, disciplines, staff and scheduling", "employeeHomeHealthOperationsLauncher"));';

    if (!source.includes(marker)) {
      throw new Error(
        'Employee Portal Home Health management launcher anchor is missing'
      );
    }

    const next = source.replace(
      marker,
      `${marker}
          quick.appendChild(launcher("Home Health Referral Inbox", "/home-health-referrals.html", "Review secure hospital and provider Home Health referrals and create intake cases", "employeeHomeHealthReferralInboxLauncher"));`
    );

    if (
      !next.includes(
        'employeeHomeHealthReferralInboxLauncher'
      )
    ) {
      throw new Error(
        'Employee Portal Home Health Referral Inbox launcher was not installed'
      );
    }

    return next;
  }
);

/*
 * --------------------------------------------------------------------------
 * S.P.I.R.E. canonical frontend entry
 * --------------------------------------------------------------------------
 *
 * /spire.html launches /spire/client-station.html. Client Station restores the
 * authenticated user's last authorized service home and loads that home's
 * clients. /spire/master.html remains chart-only and is opened only after an
 * explicit client selection.
 * --------------------------------------------------------------------------
 */

await update('spire.html', source => {
  if (
    source.includes('SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2') &&
    source.includes('/spire/client-station.html')
  ) {
    return source;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>S.P.I.R.E. Client Station | Sulandra Health</title>
  <link rel="icon" href="/favicon.ico">
  <script>
    // SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2
    (() => {
      const destination = '/spire/client-station.html' + window.location.search + window.location.hash;
      window.location.replace(destination);
    })();
  </script>
  <noscript><meta http-equiv="refresh" content="0;url=/spire/client-station.html"></noscript>
</head>
<body>
  <p>Opening S.P.I.R.E. Client Station… <a href="/spire/client-station.html">Continue to Client Station</a></p>
</body>
</html>`;
});

/*
 * --------------------------------------------------------------------------
 * SCLS Residential → Task Board
 * --------------------------------------------------------------------------
 */

await update(
  'scls-residential.html',
  source => {
    let next = source;

    if (
      !next.includes(
        'id="sclsTaskBoardLink"'
      )
    ) {
      const link =
        `<a id="sclsTaskBoardLink" data-business-uat-contract="${contract}" href="/scls-tasks.html"><span id="sclsTasksWorkflowLink">Task Board</span></a>`;

      if (
        next.includes(
          '<span class="spacer"></span>'
        )
      ) {
        next = next.replace(
          '<span class="spacer"></span>',
          `<span class="spacer"></span>${link}`
        );
      } else if (
        next.includes('</header>')
      ) {
        next = next.replace(
          '</header>',
          `${link}</header>`
        );
      } else {
        throw new Error(
          'SCLS Residential header is missing; cannot expose the Task Board workflow'
        );
      }
    }

    if (
      !next.includes(
        'id="sclsTaskBoardLink"'
      ) ||
      !next.includes(
        'id="sclsTasksWorkflowLink"'
      ) ||
      !next.includes(
        'href="/scls-tasks.html"'
      )
    ) {
      throw new Error(
        'SCLS Residential Task Board workflow bridge was not installed'
      );
    }

    return next;
  }
);

/*
 * --------------------------------------------------------------------------
 * Company Documents → Company Compliance
 * --------------------------------------------------------------------------
 */

await update(
  'company-documents.html',
  source => {
    if (
      source.includes(
        'id="companyComplianceLink"'
      )
    ) {
      return source;
    }

    const marker =
      '<a href="/employee-portal.html">Employee Portal</a>';

    if (!source.includes(marker)) {
      throw new Error(
        'Company Documents navigation anchor is missing'
      );
    }

    const next = source.replace(
      marker,
      `<a id="companyComplianceLink" data-business-uat-contract="${contract}" href="/company-compliance.html">Company Compliance</a>${marker}`
    );

    if (
      !next.includes(
        'href="/company-compliance.html"'
      )
    ) {
      throw new Error(
        'Company Documents to Company Compliance navigation was not installed'
      );
    }

    return next;
  }
);

/*
 * --------------------------------------------------------------------------
 * Workforce payroll readiness
 * --------------------------------------------------------------------------
 */

await update(
  'workforce-admin.html',
  source => {
    let next = source.replace(
      /\s*<script src="\/assets\/workforce-payroll-readiness\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
      '\n'
    );

    if (!next.includes('</body>')) {
      throw new Error(
        'Workforce Administration page has no body close'
      );
    }

    next = next.replace(
      '</body>',
      `<script src="/assets/workforce-payroll-readiness.js?v=${contract}"></script>
</body>`
    );

    return next;
  }
);

/*
 * --------------------------------------------------------------------------
 * Employee Portal production contract + navigation guard
 * --------------------------------------------------------------------------
 */

await update(
  'employee-portal.html',
  source => {
    let next = source;

    if (
      !next.includes(
        `name="sulandra-business-uat-contract" content="${contract}"`
      )
    ) {
      if (!next.includes('</head>')) {
        throw new Error(
          'Employee Portal has no head close'
        );
      }

      next = next.replace(
        '</head>',
        `<meta name="sulandra-business-uat-contract" content="${contract}">
</head>`
      );
    }

    if (
      !next.includes(
        'employee-role-navigation-guard.js'
      )
    ) {
      if (!next.includes('</body>')) {
        throw new Error(
          'Employee Portal has no body close'
        );
      }

      next = next.replace(
        '</body>',
        `<script src="/assets/employee-role-navigation-guard.js?v=${contract}"></script>
</body>`
      );
    }

    if (
      !next.includes(
        'employee-role-navigation-guard.js'
      )
    ) {
      throw new Error(
        'Employee Portal navigation guard was not published'
      );
    }

    return next;
  }
);

/*
 * --------------------------------------------------------------------------
 * Final installer summary
 * --------------------------------------------------------------------------
 */

if (skippedFrontendSources.length) {
  console.log(
    `Business-path UAT bridge installer skipped frontend-only sources that are not present in this build image: ${
      [...new Set(skippedFrontendSources)].join(', ')
    }.`
  );
} else {
  console.log(
    [
      'Business-path UAT bridges installed:',
      'canonical hiring APIs,',
      'secure Home Health invitation tokens and rail stability v2,',
      'Home Health Referral Inbox navigation,',
      'SCLS Task Board continuity,',
      'Company Documents compliance continuity,',
      'guarded Workforce navigation,',
      'Employee Portal production contract marker,',
      'and canonical SPIRE Client Station entry.',
    ].join(' ')
  );
}
