import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiledWorkflowPath = path.join(repositoryRoot, 'api', 'dist', 'applicant-workflow.js');
const source = await readFile(compiledWorkflowPath, 'utf8');

const startMarker = 'function brandedEmailHtml(body) {';
const endMarker = 'function normalizePhone';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error('Could not locate brandedEmailHtml in the compiled applicant workflow.');
}

const replacement = `function brandedEmailHtml(body) {
    const companyAddress = [
        process.env.SULANDRA_ADDRESS_LINE_1?.trim() || '822 Dalewood Place, Suite A',
        process.env.SULANDRA_ADDRESS_LINE_2?.trim() || 'Dayton, Ohio 45426',
    ];
    const lines = body.split('\\n');
    const sincerelyIndex = lines.findIndex((line) => line.trim() === 'Sincerely,');
    const contentLines = sincerelyIndex >= 0 ? lines.slice(0, sincerelyIndex) : lines;
    const paragraphs = contentLines
        .join('\\n')
        .split(/\\n{2,}/)
        .filter(Boolean)
        .map((paragraph) => \`<div style="margin:0 0 17px;line-height:1.65">\${paragraph.split('\\n').map(emailLineHtml).join('')}</div>\`)
        .join('');
    const addressHtml = companyAddress.map((line) => escapeEmailHtml(line)).join('<br>');
    return \`<div style="margin:0;background:#eef5fa;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#102448">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d8e5ef;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(15,57,86,.12)">
        <div style="padding:25px 30px;background:linear-gradient(135deg,#dceffc,#8ec4e8);border-bottom:5px solid #c8a64b">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#075985">Sulandra Health</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:1.2;color:#102448">Human Resources Department</h1>
        </div>
        <div style="padding:30px">\${paragraphs}
          <div style="margin-top:30px;padding-top:24px;border-top:1px solid #d7e5ef">
            <div style="font-size:16px;color:#475569;margin-bottom:13px">Sincerely,</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:800;color:#075985">\${escapeEmailHtml(careersHrDisplayName)}</div>
            <div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:900;color:#a16207">Sulandra Health</div>
            <div style="margin-top:12px;font-size:14px;line-height:1.65;color:#52657d">\${addressHtml}<br><a href="mailto:\${escapeEmailHtml(careersFromEmail)}" style="color:#075985;text-decoration:none;font-weight:700">\${escapeEmailHtml(careersFromEmail)}</a></div>
          </div>
          <div style="margin-top:28px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:12px;line-height:1.6;color:#64748b">This message was sent by the Sulandra Health Human Resources Department concerning an employment application. This message is not an offer of employment.</div>
        </div>
      </div>
    </div>\`;
}

`;

await writeFile(
  compiledWorkflowPath,
  source.slice(0, start) + replacement + source.slice(end),
  'utf8',
);

console.log('Professional Human Resources footer applied to all applicant emails.');
