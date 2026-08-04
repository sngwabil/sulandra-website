import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../api/src/careers-routes.ts', import.meta.url);
let source = await readFile(target, 'utf8');
const marker = '// DEPARTMENT_ROUTING_V1';

if (source.includes(marker)) {
  console.log('Department routing is already installed.');
  process.exit(0);
}

const jobTitleAnchor = `      const jobTitle = opening?.title || String(input.applicationData.position || appliedRole);`;
if (!source.includes(jobTitleAnchor)) {
  throw new Error('Careers job-title anchor was not found.');
}

const routingBlock = `${jobTitleAnchor}
      ${marker}
      const departmentText = \`${'${opening?.department ?? \'\'} ${jobTitle}'}\`.toLowerCase();
      const department = /nemt|transport|driver|dispatch|fleet/.test(departmentText)
        ? { code: 'NEMT', name: 'Sulandra Health Non-Medical Transportation Services' }
        : /home health|clinical|nursing|registered nurse|licensed practical nurse|delegating nurse/.test(departmentText)
          ? { code: 'HOME_HEALTH', name: 'Sulandra Home Health Care Services' }
          : { code: 'COMMUNITY_LIVING', name: 'Sulandra Community Living Services' };
      const routedApplicationData = {
        ...input.applicationData,
        departmentCode: department.code,
        departmentName: department.name,
        departmentSource: opening?.department ? 'JOB_OPENING' : 'APPLICATION_DEFAULT',
      };`;

source = source.replace(jobTitleAnchor, routingBlock);

const jsonAnchor = `        JSON.stringify(input.applicationData),`;
if (!source.includes(jsonAnchor)) {
  throw new Error('Careers application-data insert anchor was not found.');
}
source = source.replace(jsonAnchor, `        JSON.stringify(routedApplicationData),`);

await writeFile(target, source);
console.log('Installed department routing for careers applications.');
