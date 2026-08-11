import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  path.join(root, 'assets', 'admin-employee-management.js'),
  path.join(root, 'dist-web', 'assets', 'admin-employee-management.js'),
];

function patchSource(source) {
  // Carry the selected-company header on every protected Employee 360 request.
  if (!source.includes("...(window.SulandraCompanyContext?.headers?.() || {})")) {
    source = source.replace(
      /(Authorization:\s*`Bearer \$\{auth\}`,\s*\n)/,
      "$1        ...(window.SulandraCompanyContext?.headers?.() || {}),\n",
    );
  }

  // Make the directory loader retry only transient authenticated-startup failures.
  source = source.replace(
    /async function loadEmployees\(\) \{/,
    'async function loadEmployees(attempt = 0) {',
  );

  const legacyCatch = `    } catch (error) {\n      setStatus(error.message, true);\n      document.getElementById('employeeList').innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(error.message)}</p></div>\`;\n    }`;
  const retryCatch = `    } catch (error) {\n      const message = String(error?.message || 'Request failed');\n      const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);\n      if (transientAuth && token() && attempt < 2) {\n        setStatus('');\n        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));\n        await window.SulandraCompanyContext?.initialize?.().catch(() => undefined);\n        return loadEmployees(attempt + 1);\n      }\n      setStatus(message, true);\n      const list = document.getElementById('employeeList');\n      if (list) list.innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(message)}</p></div>\`;\n    }`;

  if (source.includes(legacyCatch)) source = source.replace(legacyCatch, retryCatch);

  // Idempotent fallback for the current minutely-edited source shape.
  if (!source.includes('const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);')) {
    source = source.replace(
      /    } catch \(error\) \{\n      setStatus\(error\.message, true\);\n      document\.getElementById\('employeeList'\)\.innerHTML = `[^`]*`;\n    }/,
      retryCatch,
    );
  }

  return source;
}

let patched = 0;
for (const target of targets) {
  let source;
  try { source = await readFile(target, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  source = patchSource(source);

  const verified = source.includes("...(window.SulandraCompanyContext?.headers?.() || {})")
    && source.includes('async function loadEmployees(attempt = 0) {')
    && source.includes('const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);');
  if (!verified) {
    throw new Error(`Unable to verify Admin Employee 360 auth-flash fix in ${target}`);
  }

  await writeFile(target, source, 'utf8');
  patched += 1;
}

if (!patched) throw new Error('Admin Employee 360 asset was not found in source or dist-web');
console.log(`Admin Employee 360 startup auth flash fixed in ${patched} asset copy/copies: company headers included and transient authenticated boot 401s retry silently.`);
