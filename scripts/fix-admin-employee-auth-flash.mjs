import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'assets', 'admin-employee-management.js');
let source = await readFile(target, 'utf8');

const oldHeaders = `headers: {\n        Accept: 'application/json',\n        Authorization: \`Bearer \${auth}\`,\n        ...(options.body ? { 'Content-Type': 'application/json' } : {}),`;
const newHeaders = `headers: {\n        Accept: 'application/json',\n        Authorization: \`Bearer \${auth}\`,\n        ...(window.SulandraCompanyContext?.headers?.() || {}),\n        ...(options.body ? { 'Content-Type': 'application/json' } : {}),`;
if (source.includes(oldHeaders)) source = source.replace(oldHeaders, newHeaders);

source = source.replace('async function loadEmployees() {', 'async function loadEmployees(attempt = 0) {');

const oldCatch = `    } catch (error) {\n      setStatus(error.message, true);\n      document.getElementById('employeeList').innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(error.message)}</p></div>\`;\n    }`;
const newCatch = `    } catch (error) {\n      const message = String(error?.message || 'Request failed');\n      const transientAuth = /authentication required|administrator sign-in is required|admin session is unavailable/i.test(message);\n      if (transientAuth && token() && attempt < 2) {\n        setStatus('');\n        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));\n        await window.SulandraCompanyContext?.initialize?.().catch(() => undefined);\n        return loadEmployees(attempt + 1);\n      }\n      setStatus(message, true);\n      document.getElementById('employeeList').innerHTML = \`<div class="e360-empty"><h3>Employee directory unavailable</h3><p>\${esc(message)}</p></div>\`;\n    }`;
if (!source.includes(oldCatch)) throw new Error('Employee directory catch block anchor not found');
source = source.replace(oldCatch, newCatch);

await writeFile(target, source, 'utf8');
console.log('Admin Employee 360 startup auth flash fixed: company headers included and transient authenticated boot 401s retry silently.');
