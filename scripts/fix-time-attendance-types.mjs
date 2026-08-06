import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const filePath = path.join(repositoryRoot, 'api', 'src', 'time-attendance-routes.ts');
let source = await readFile(filePath, 'utf8');

const oldText = "const input=shiftSchema.partial().parse(req.body);";
const newText = "const input=z.object({employeeId:z.string().trim().nullable().optional(),startTime:z.coerce.date().optional(),endTime:z.coerce.date().optional(),code:z.string().trim().min(1).max(30).optional(),department:z.string().trim().max(120).optional(),location:z.string().trim().max(200).optional(),notes:z.string().trim().max(2000).optional(),clientId:z.string().trim().nullable().optional(),payCode:z.string().trim().max(40).optional()}).refine(v=>!v.startTime||!v.endTime||v.endTime>v.startTime,{message:'End must be after start'}).parse(req.body);";

if (source.includes(oldText)) {
  source = source.replace(oldText, newText);
  await writeFile(filePath, source, 'utf8');
  console.log('Time and Attendance update schema TypeScript compatibility repair applied.');
} else {
  console.log('Time and Attendance update schema is already compatible.');
}
