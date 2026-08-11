import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  path.join(root, 'assets', 'admin-employee-management.js'),
  path.join(root, 'dist-web', 'assets', 'admin-employee-management.js'),
];

const oldHeaders = `headers: {\n        Accept: 'application/json',\n        Authorization: \`Bearer \${auth}\`,\n        ...(options.body ? { 'Content-Type': 'application/json' } : {}),`;
const newHeaders = `headers: {\n        Accept: 'application/json',\n        Authorization: \`Bearer \${auth}\`,\n        ...(window.SulandraCompanyContext?.headers?.() || {}),\n        ...(options.body ? { 'Content-Type': 'application/json' } : {}),`;
const oldCatch = `    } catch (error) {\n      setStatus(error.message, true);\n      document.getElementById('employeeList').innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(error.message)}</p></div>\`;\n    }`;
const newCatch = `    } catch (error) {\n      const message = String(error?.message || 'Request failed');\n      const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);\n      if (transientAuth && token() && attempt < 2) {\n        setStatus('');\n        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));\n        await window.SulandraCompanyContext?.initialize?.().catch(() => undefined);\n        return loadEmployees(attempt + 1);\n      }\n      setStatus(message, true);\n      document.getElementById('employeeList').innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(message)}</p></div>\`;\n    }`;

let patched = 0;
for (const target of targets) {
  let source;
  try { source = await readFile(target, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') continue; throw error; }

  if (source.includes(oldHeaders)) source = source.replace(oldHeaders, newHeaders);
  if (source.includes('async function loadEmployees() {')) source = source.replace('async function loadEmployees() {', 'async function loadEmployees(attempt = 0) {');
  if (source.includes(oldCatch)) source = source.replace(oldCatch, newCatch);

  const verified = source.includes("...(window.SulandraCompanyContext?.headers?.() || {})")
    && source.includes('async function loadEmployees(attempt = 0) {')
    && source.includes('const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);');
  if (!verified) throw new Error(`Unable to verify Admin Employee 360 auth-flash fix in ${target}`);

  await writeFile(target, source, 'utf8');
  patched += 1;
}
if (!patched) throw new Error('Admin Employee 360 asset was not found in source or dist-web');
console.log(`Admin Employee 360 startup auth flash fixed in ${patched} asset copy/copies: company headers included and transient authenticated boot 401s retry silently.`);
