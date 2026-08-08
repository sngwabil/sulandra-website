import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'applylpn.html');
const targetPath = path.join(root, 'applyrn.html');

let html = await readFile(sourcePath, 'utf8');

const replacements = [
  ['<title>LPN Application | Sulandra Community Living Services</title>', '<title>RN Application | Sulandra Community Living Services</title>'],
  ['Licensed Practical Nurse (LPN) application with resume upload, license details, work history, references, and file uploads saved to Firebase.', 'Registered Nurse (RN) application with resume upload, license details, work history, references, and secure file uploads.'],
  ['aria-label="LPN application form"', 'aria-label="RN application form"'],
  ['Application for: Licensed Practical Nurse (LPN)', 'Application for: Registered Nurse (RN)'],
  ['name="jobTitle" value="Licensed Practical Nurse (LPN)"', 'name="jobTitle" value="Registered Nurse (RN)"'],
  ['Provide your LPN license details and current certifications.', 'Provide your RN license details and current certifications.'],
  ['>LPN license number<', '>RN license number<'],
  ['Years of LPN experience', 'Years of RN experience'],
  ['Why are you interested in this LPN role?', 'Why are you interested in this RN role?'],
  ['<div class="kv"><span>Role:</span><span>Licensed Practical Nurse (LPN)</span></div>', '<div class="kv"><span>Role:</span><span>Registered Nurse (RN)</span></div>'],
  ['• Collaborate with RNs/lead staff and follow agency protocols.', '• Collaborate with clinical leadership and interdisciplinary team members and follow agency protocols.'],
  ['new URLSearchParams(window.location.search).get("role") || "LPN"', 'new URLSearchParams(window.location.search).get("role") || "RN"'],
  ['String(params.get("role") || "LPN").toUpperCase()', 'String(params.get("role") || "RN").toUpperCase()'],
  ['const DRAFT_KEY = "scls_apply_lpn_v2_draft";', 'const DRAFT_KEY = "scls_apply_rn_v2_draft";'],
  ['a.download = `lpn-application-draft-${new Date().toISOString().slice(0,10)}.json`;', 'a.download = `rn-application-draft-${new Date().toISOString().slice(0,10)}.json`;'],
];

for (const [from, to] of replacements) html = html.replaceAll(from, to);

if (!html.includes('Application for: Registered Nurse (RN)')) throw new Error('RN application heading was not generated');
if (!html.includes('const DRAFT_KEY = "scls_apply_rn_v2_draft";')) throw new Error('RN draft storage was not isolated');
if (!html.includes('params.get("role") || "RN"')) throw new Error('RN application does not default to RN');

await writeFile(targetPath, html, 'utf8');
console.log('Dedicated RN application generated from the maintained nursing application workflow.');
