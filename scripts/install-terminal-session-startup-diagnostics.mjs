import fs from 'node:fs';

const target = process.argv[2];
const mode = process.argv[3];
if (!target || !mode) throw new Error('Usage: node install-terminal-session-startup-diagnostics.mjs <target> <executor|entrypoint>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'TERMINAL_SESSION_STARTUP_DIAGNOSTICS_V1';
if (source.includes(marker)) {
  console.log(`Terminal session startup diagnostics already installed (${mode}).`);
  process.exit(0);
}

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Terminal startup diagnostics patch failed (${mode}): ${label}`);
  source = source.replace(from, to);
};

if (mode === 'entrypoint') {
  replace(
    '#!/usr/bin/env bash\nset -euo pipefail\n',
    `#!/usr/bin/env bash\nset -Eeuo pipefail\n\n# ${marker}\n# Emit only a controlled, non-secret startup stage marker when bootstrap fails.\n# The executor reads this marker so Railway can distinguish persistent-home, cwd,\n# IDE-settings, and agent-launch failures instead of surfacing generic "fetch failed".\nSULANDRA_STARTUP_STAGE=entrypoint\nsulandra_startup_failure() {\n  local rc="$?"\n  printf '[sulandra-session-startup] stage=%s rc=%s line=%s\\n' \\\n    "\${SULANDRA_STARTUP_STAGE:-unknown}" "\${rc}" "\${BASH_LINENO[0]:-0}" >&2\n  exit "\${rc}"\n}\ntrap sulandra_startup_failure ERR\n`,
    'install controlled ERR trap',
  );

  replace(
    `TERMINAL_CWD="\${SULANDRA_TERMINAL_CWD:-/projects}"\nsource /usr/local/bin/sulandra-codebase-setup\ncd "\${TERMINAL_CWD}"`,
    `TERMINAL_CWD="\${SULANDRA_TERMINAL_CWD:-/projects}"\nSULANDRA_STARTUP_STAGE=codebase-setup\nsource /usr/local/bin/sulandra-codebase-setup\nSULANDRA_STARTUP_STAGE=working-directory\ncd "\${TERMINAL_CWD}"\nSULANDRA_STARTUP_STAGE=ide-settings`,
    'label bootstrap stages',
  );

  replace(
    `PORT="\${IDE_PORT}" /usr/local/bin/code-server \\\n`,
    `SULANDRA_STARTUP_STAGE=code-server-launch\nPORT="\${IDE_PORT}" /usr/local/bin/code-server \\\n`,
    'label code-server launch',
  );

  replace(
    'exec node /agent/server.mjs',
    `SULANDRA_STARTUP_STAGE=session-agent-launch\n# exec preserves the existing PID/signal model. Failures before exec are covered\n# by the ERR trap; post-exec crashes are reported from Docker container state.\nexec node /agent/server.mjs`,
    'label session agent launch',
  );

  for (const required of [marker, 'stage=%s rc=%s line=%s', 'SULANDRA_STARTUP_STAGE=codebase-setup', 'SULANDRA_STARTUP_STAGE=session-agent-launch']) {
    if (!source.includes(required)) throw new Error(`Terminal startup diagnostics entrypoint verification missing: ${required}`);
  }
} else if (mode === 'executor') {
  replace(
    'const createSession = async (workspace, owner, cols, rows) => {',
    `/* ${marker}\n   New-session failures used to collapse into an opaque "fetch failed" after the\n   executor removed the failed container. Capture Docker state plus a tightly\n   sanitized startup hint before cleanup. Never return arbitrary container logs. */\nconst sessionStartupDiagnostic = async (container, error) => {\n  let state = 'unknown';\n  let exitCode = 'unknown';\n  let oomKilled = false;\n  let dockerError = '';\n  try {\n    const inspect = await container.inspect();\n    state = String(inspect.State?.Status || (inspect.State?.Running ? 'running' : 'unknown'));\n    exitCode = Number.isFinite(Number(inspect.State?.ExitCode)) ? String(inspect.State.ExitCode) : 'unknown';\n    oomKilled = Boolean(inspect.State?.OOMKilled);\n    dockerError = String(inspect.State?.Error || '').replace(/\\s+/g, ' ').slice(0, 240);\n  } catch {}\n\n  let startupMarker = '';\n  let safeHint = '';\n  try {\n    const logs = await container.logs({ stdout: true, stderr: true, tail: 120, timestamps: false });\n    const text = Buffer.from(logs || '').toString('utf8').replace(/[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]/g, '');\n    const matches = [...text.matchAll(/\\[sulandra-session-startup\\] stage=([A-Za-z0-9_-]+) rc=([0-9]+) line=([0-9]+)/g)];\n    if (matches.length) {\n      const match = matches[matches.length - 1];\n      startupMarker = \`stage=\${match[1]} rc=\${match[2]} line=\${match[3]}\`;\n    }\n\n    // Only surface a final line that already looks like a startup error. Strip\n    // URLs, bearer values, and long token-shaped strings before returning it.\n    const errorLines = text.split(/\\r?\\n/)\n      .map(line => line.trim())\n      .filter(Boolean)\n      .filter(line => /(permission denied|not a directory|is a directory|no such file|read-only file system|operation not permitted|command not found|sudo:|install:|mkdir:|mv:|tee:|touch:|chmod:|chown:|fatal:|error|failed)/i.test(line));\n    if (errorLines.length) {\n      safeHint = errorLines[errorLines.length - 1]\n        .replace(/https?:\\/\\/\\S+/gi, '[url]')\n        .replace(/Bearer\\s+\\S+/gi, 'Bearer [redacted]')\n        .replace(/\\b[A-Za-z0-9_-]{40,}\\b/g, '[redacted]')\n        .replace(/\\s+/g, ' ')\n        .slice(0, 320);\n    }\n  } catch {}\n\n  const probe = String(error?.message || error || 'agent not ready').replace(/\\s+/g, ' ').slice(0, 180);\n  return [\n    startupMarker || 'stage=unknown',\n    \`container=\${state}\`,\n    \`exit=\${exitCode}\`,\n    \`oom=\${oomKilled}\`,\n    dockerError ? \`docker=\${dockerError}\` : '',\n    safeHint ? \`hint=\${safeHint}\` : '',\n    \`probe=\${probe}\`,\n  ].filter(Boolean).join(' ');\n};\n\nconst createSession = async (workspace, owner, cols, rows) => {`,
    'install sanitized container startup diagnostics',
  );

  replace(
    `  } catch (error) {\n    sessions.delete(sessionId);\n    try { await container.remove({ force: true }); } catch {}\n    throw error;\n  }`,
    `  } catch (error) {\n    const diagnostic = await sessionStartupDiagnostic(container, error);\n    console.error('[terminal-executor] Session startup failed', diagnostic);\n    sessions.delete(sessionId);\n    try { await container.remove({ force: true }); } catch {}\n    const startupError = new Error(\`Terminal session startup failed: \${diagnostic}\`);\n    startupError.status = Number(error?.status) || 500;\n    throw startupError;\n  }`,
    'capture diagnostic before failed container cleanup',
  );

  for (const required of [marker, 'sessionStartupDiagnostic', 'Session startup failed', 'startupError.status', 'safeHint']) {
    if (!source.includes(required)) throw new Error(`Terminal startup diagnostics executor verification missing: ${required}`);
  }
} else {
  throw new Error(`Unknown terminal startup diagnostics mode: ${mode}`);
}

fs.writeFileSync(target, source);
console.log(`Installed terminal session startup diagnostics (${mode}) in ${target}.`);
