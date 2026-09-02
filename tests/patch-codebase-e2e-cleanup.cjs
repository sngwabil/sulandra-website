const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "let browser;\nlet auth;",
  "let browser;\nlet auth;\nlet page;\nlet activeWorkspaceId = '';\nconst cleanupWorkspaceIds = String(process.env.E2E_CLEANUP_WORKSPACE_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);",
);

source = source.replace(
  "  console.log('[E2E INFO] Feature Codebase API authenticated without exposing credentials');",
  `  console.log('[E2E INFO] Feature Codebase API authenticated without exposing credentials');
  for (const workspaceId of cleanupWorkspaceIds) {
    try {
      const response = await fetch(\`${'${'}API}/api/it-solutions/terminal/workspaces/${'${'}encodeURIComponent(workspaceId)}\`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: \`Bearer ${'${'}auth.token}\` },
      });
      if (response.ok || response.status === 404 || response.status === 410) {
        console.log('[E2E INFO] Disposable workspace cleanup accepted: ' + workspaceId);
      } else {
        console.log('[E2E WARN] Disposable workspace cleanup returned HTTP ' + response.status + ': ' + workspaceId);
      }
    } catch (error) {
      console.log('[E2E WARN] Disposable workspace cleanup failed: ' + String(error?.message || error));
    }
  }`,
);

source = source.replace(
  "  const page = await context.newPage();",
  "  page = await context.newPage();",
);

source = source.replace(
  "    assert(sessionId, 'Save did not start a real terminal session');\n    await waitForTerminal(auth.token, sessionId, `[Codebase] saved ${existingPath}`);",
  "    assert(sessionId, 'Save did not start a real terminal session');\n    activeWorkspaceId = await page.evaluate(() => sessionStorage.getItem('sulandra:it-solutions:terminal-workspace') || '');\n    await waitForTerminal(auth.token, sessionId, `[Codebase] saved ${existingPath}`);",
);

source = source.replace(
  "} finally {\n  await browser?.close().catch(() => {});\n}",
  `} finally {
  if (!activeWorkspaceId && page) {
    try { activeWorkspaceId = await page.evaluate(() => sessionStorage.getItem('sulandra:it-solutions:terminal-workspace') || ''); } catch {}
  }
  if (activeWorkspaceId && auth?.token) {
    try {
      const response = await fetch(\`${'${'}API}/api/it-solutions/terminal/workspaces/${'${'}encodeURIComponent(activeWorkspaceId)}\`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: \`Bearer ${'${'}auth.token}\` },
      });
      console.log('[E2E INFO] Current disposable workspace teardown HTTP ' + response.status + ': ' + activeWorkspaceId);
    } catch (error) {
      console.log('[E2E WARN] Current disposable workspace teardown failed: ' + String(error?.message || error));
    }
  }
  await browser?.close().catch(() => {});
}`,
);

fs.writeFileSync(file, source, 'utf8');
