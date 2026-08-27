import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'entity-access.ts');
const marker = 'ENTERPRISE_OWNER_NO_IMPLICIT_DEPARTMENT_V1';

let source = await readFile(target, 'utf8');
if (!source.includes(marker)) {
  const oldBlock = `  } else {\n    const primaryDepartmentId = employments.find((employment) => employment.primaryEmployment)?.departmentId\n      ?? employments.find((employment) => employment.departmentId)?.departmentId\n      ?? null;\n    department = departments.find((candidate) => candidate.id === primaryDepartmentId)\n      ?? (allowedDepartmentIds.length === 1 ? departments.find((candidate) => candidate.id === allowedDepartmentIds[0]) : undefined);\n  }`;
  const newBlock = `  } else if (identity.enterpriseOwner) {\n    // ${marker}\n    // The enterprise owner manages every department. When no department was\n    // explicitly requested, keep the company context enterprise-wide instead\n    // of silently narrowing it to one of the owner's own employments.\n    department = undefined;\n  } else {\n    const primaryDepartmentId = employments.find((employment) => employment.primaryEmployment)?.departmentId\n      ?? employments.find((employment) => employment.departmentId)?.departmentId\n      ?? null;\n    department = departments.find((candidate) => candidate.id === primaryDepartmentId)\n      ?? (allowedDepartmentIds.length === 1 ? departments.find((candidate) => candidate.id === allowedDepartmentIds[0]) : undefined);\n  }`;
  if (!source.includes(oldBlock)) throw new Error('Enterprise owner department-scope anchor changed in api/src/entity-access.ts');
  source = source.replace(oldBlock, newBlock);
  await writeFile(target, source, 'utf8');
}

if (!source.includes(marker) && !(await readFile(target, 'utf8')).includes(marker)) {
  throw new Error('Enterprise owner onboarding API scope patch was not installed');
}
console.log('Enterprise owner company context is department-wide by default, so owner recruiting views can aggregate every department without weakening company Operations boundaries.');
