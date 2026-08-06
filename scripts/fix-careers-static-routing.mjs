import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticBase = 'https://www.sulandrahealth.com';
const apiBase = 'https://sulandra-website-production-5fc4.up.railway.app';
const htmlFiles = ['index.html','careers.html','applydsp.html','applylpn.html','applygeneral.html','applycoo.html','applydoo.html'];

for (const file of htmlFiles) {
  const sourcePath = path.join(root, file);
  let html;
  try { html = await readFile(sourcePath, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') continue; throw error; }

  html = html
    .replaceAll('https://sulandra-website-production.up.railway.app', apiBase)
    .replaceAll('href="/Careers.html"', `href="${staticBase}/careers.html"`)
    .replaceAll("href='/Careers.html'", `href='${staticBase}/careers.html'`)
    .replaceAll('href="/careers.html"', `href="${staticBase}/careers.html"`)
    .replaceAll("href='/careers.html'", `href='${staticBase}/careers.html'`);

  await writeFile(sourcePath, html, 'utf8');
}

console.log('Careers and application pages are pinned to the Sulandra Static Website; only API calls use the Railway backend.');
