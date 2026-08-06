import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'employee-analytics-reports-routes.ts');
let source = await readFile(target, 'utf8');

const oldLine = "const toCsv=(rows:any[])=>{if(!rows.length)return'';const keys=Array.from(rows.reduce((set,row)=>{Object.keys(row).forEach(k=>set.add(k));return set},new Set<string>()));return [keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(','))].join('\\n')};";
const newLine = "const toCsv=(rows:any[])=>{if(!rows.length)return'';const keys:string[]=Array.from(rows.reduce<Set<string>>((set: Set<string>,row:any)=>{Object.keys(row).forEach((key:string)=>set.add(key));return set},new Set<string>()));return [keys.map(csvCell).join(','),...rows.map((row:any)=>keys.map((key:string)=>csvCell(row[key])).join(','))].join('\\n')};";

if (source.includes(oldLine)) {
  source = source.replace(oldLine, newLine);
  await writeFile(target, source, 'utf8');
  console.log('Employee analytics CSV export key typing is build-safe.');
} else if (source.includes('const keys:string[]=Array.from(rows.reduce<Set<string>>')) {
  console.log('Employee analytics CSV export key typing is already build-safe.');
} else {
  throw new Error('Unable to locate the Employee analytics CSV serializer that requires TypeScript repair.');
}
