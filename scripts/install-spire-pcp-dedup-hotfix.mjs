import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const hotfixPath = path.join(root, 'assets', 'spire-pcp-dedup-hotfix.js');
const HOTFIX_URL = '/assets/spire-pcp-dedup-hotfix.js?v=20260814-pcp-dedup-1';
const MARKER = 'SPIRE_PCP_CARD_DEDUP_V1';

const hotfix = await readFile(hotfixPath, 'utf8');
if (!hotfix.includes(MARKER)) throw new Error(`SPIRE PCP dedup hotfix is missing ${MARKER}`);
if (!hotfix.includes("[data-spire-pcp-photo]{display:none!important}")) throw new Error('SPIRE PCP dedup hotfix does not suppress the retired PCP card');
if (!hotfix.includes("canonicalRows.slice(1)")) throw new Error('SPIRE PCP dedup hotfix does not collapse duplicate canonical PCP rows');

let master = await readFile(masterPath, 'utf8');
master = master.replace(/\s*<script\s+src=["']\/assets\/spire-pcp-dedup-hotfix\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
if (!master.includes('</body>')) throw new Error('SPIRE master is missing </body>');
master = master.replace('</body>', `  <script src="${HOTFIX_URL}"></script>\n</body>`);
await writeFile(masterPath, master, 'utf8');

const count = (master.match(/\/assets\/spire-pcp-dedup-hotfix\.js\?v=/g) || []).length;
if (count !== 1) throw new Error(`SPIRE master must publish the PCP dedup hotfix exactly once; found ${count}`);

console.log(`SPIRE PCP provider card deduplication published via ${HOTFIX_URL}; retired MAR PCP cards are hidden/removed and only one canonical patient-scoped PCP card remains visible.`);
