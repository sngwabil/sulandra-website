import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePath = path.join(root, 'assets', 'employee-compliance-self-service.js');
const adminPath = path.join(root, 'assets', 'admin-employee-compliance.js');

let employee = await readFile(employeePath, 'utf8');
employee = employee
  .replace(
    '    const completed = Number(summary.compliant || 0);',
    '    const completed = Number(summary.currentlyCompliant ?? summary.compliant ?? 0);',
  )
  .replace(
    '<div class="self-compliance-stat"><span>Compliant</span><strong>${completed}</strong></div>',
    '<div class="self-compliance-stat"><span>Currently Compliant</span><strong>${completed}</strong></div>',
  )
  .replace(
    '${percent}% currently compliant based on approved Employee 360 evidence.',
    '${percent}% currently compliant, including approved records that are due for renewal soon.',
  );
await writeFile(employeePath, employee, 'utf8');

let admin = await readFile(adminPath, 'utf8');
admin = admin
  .replace(
    "data.assignments.filter(item=>item.status==='COMPLIANT'||item.status==='EXEMPT').length",
    "data.assignments.filter(item=>['COMPLIANT','DUE_SOON','EXEMPT'].includes(item.status)).length",
  )
  .replace(
    '<span>Compliant</span><strong>${data.assignments.filter(item=>[\'COMPLIANT\',\'DUE_SOON\',\'EXEMPT\'].includes(item.status)).length}</strong>',
    '<span>Currently Compliant</span><strong>${data.assignments.filter(item=>[\'COMPLIANT\',\'DUE_SOON\',\'EXEMPT\'].includes(item.status)).length}</strong>',
  );
await writeFile(adminPath, admin, 'utf8');

console.log('Employee and administrator compliance dashboards now treat due-soon current evidence as compliant while retaining renewal warnings.');
