import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(repositoryRoot, 'dist-web', 'admin-railway.js');
const adminHtmlPath = path.join(repositoryRoot, 'dist-web', 'admin.html');

let runtime = await readFile(runtimePath, 'utf8');

const openNeedle = '    $("interviewModal").style.zIndex = "12000";\n    $("interviewModal").style.display = "block";';
const openReplacement = `    const detailsModal = $("detailsModal");
    if (detailsModal) {
      detailsModal.style.pointerEvents = "none";
      detailsModal.setAttribute("aria-hidden", "true");
    }
    const interviewModal = $("interviewModal");
    interviewModal.style.zIndex = "20000";
    interviewModal.style.display = "block";
    interviewModal.removeAttribute("aria-hidden");`;

if (!runtime.includes(openNeedle)) {
  throw new Error('Could not locate the patched interview scheduler open logic.');
}
runtime = runtime.replace(openNeedle, openReplacement);

const closeNeedle = '    $("interviewModal").style.display = "none";\n    interviewApplicationId = "";';
const closeReplacement = `    $("interviewModal").style.display = "none";
    $("interviewModal").setAttribute("aria-hidden", "true");
    const detailsModal = $("detailsModal");
    if (detailsModal) {
      detailsModal.style.pointerEvents = "";
      detailsModal.removeAttribute("aria-hidden");
    }
    interviewApplicationId = "";`;

if (!runtime.includes(closeNeedle)) {
  throw new Error('Could not locate the interview scheduler close logic.');
}
runtime = runtime.replace(closeNeedle, closeReplacement);
await writeFile(runtimePath, runtime, 'utf8');

let adminHtml = await readFile(adminHtmlPath, 'utf8');
adminHtml = adminHtml
  .replace(/careers-admin-workflow\.js\?v=[^"']+/g, 'careers-admin-workflow.js?v=20260803-interview-scheduler-foreground-1')
  .replace(/admin-railway\.js\?v=[^"']+/g, 'admin-railway.js?v=20260803-interview-scheduler-foreground-1');
await writeFile(adminHtmlPath, adminHtml, 'utf8');

console.log('Interview scheduler foreground and cache-busting repair applied.');
