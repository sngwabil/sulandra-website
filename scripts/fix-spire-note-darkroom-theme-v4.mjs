import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notePath = path.join(root, 'assets', 'spire-note-composer-v2.js');
const marker = 'SPIRE_NOTE_DARKROOM_THEME_BRIDGE_V4';
const assetVersion = '20260817-note-darkroom-v4-1';

await access(notePath);
let source = await readFile(notePath, 'utf8');

if (!source.includes('SPIRE_NOTE_IDENTITY_PRESENTATION_V3')) {
  throw new Error('Spire Notes Dark Room v4 requires the author-first Notes identity patch first');
}

if (!source.includes(marker)) {
  const mediaAnchor = '      @media(max-width:900px)';
  if (!source.includes(mediaAnchor)) throw new Error('Spire Notes Dark Room v4 could not find the Notes style insertion anchor');

  const bridgeCss = `      /* ${marker}: the Notes workspace must inherit Dark Room instead of repainting itself with light surfaces. */
      :root[data-spire-epic-theme="darkRoom"] #notes-view[data-spire-note-composer-v2="1"]{background:var(--epic-bg)!important;color:var(--epic-text)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-shell{background:var(--epic-bg)!important;color:var(--epic-text)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-left{background:var(--epic-panel)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-left-head,.snc-top,.snc-reader-head){background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-main,.snc-compose,.snc-reader){background:var(--epic-bg)!important;color:var(--epic-text)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-note-card,.snc-reader-card){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;box-shadow:none!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-note-card:hover,
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-note-card:focus{background:var(--epic-active)!important;border-color:var(--epic-accent2)!important;box-shadow:inset 4px 0 0 var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-note-card.active{background:#24172e!important;border-color:var(--epic-accent)!important;box-shadow:inset 4px 0 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-toolbar,.snc-template-hint,.snc-status,.snc-audit-strip){background:var(--epic-panel)!important;color:var(--epic-muted)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-tabs{background:#0c182c!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-tab{background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-tab:hover{background:var(--epic-active)!important;color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-tab.active{background:#21152e!important;color:var(--epic-accent)!important;border-top-color:var(--epic-accent)!important;box-shadow:inset 0 2px 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-reader-body{background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-left-title,.snc-card-title,.snc-user,.snc-person-name,.snc-reader-title,.snc-section-heading){color:var(--epic-text)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-user-sub,.snc-card-meta,.snc-reader-meta,.snc-sign-meta,.snc-person-credentials){color:var(--epic-muted)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-note-type{color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-count{background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-search,.snc-field select,.snc-field input,.snc-toolbar select,.snc-editor){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view :is(.snc-search,.snc-field input,.snc-editor)::placeholder{color:var(--epic-muted)!important;opacity:1}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-field label{color:var(--epic-muted)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-field select:disabled{background:var(--epic-panel)!important;color:var(--epic-muted)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-btn{background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-btn:hover{background:var(--epic-active)!important;border-color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-btn.primary{background:var(--epic-accent2)!important;color:#04131b!important;border-color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-btn.sign{background:var(--epic-success)!important;color:#07170e!important;border-color:var(--epic-success)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-avatar{border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-badge{background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-badge.signed{background:var(--epic-success-tint)!important;color:var(--epic-success)!important;border-color:var(--epic-success)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-badge.draft{background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-color:var(--epic-warn)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-badge.template{background:var(--epic-active)!important;color:var(--epic-accent2)!important;border-color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-badge.paste{background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-color:var(--epic-warn)!important}
      :root[data-spire-epic-theme="darkRoom"] #notes-view .snc-empty{color:var(--epic-muted)!important}
`;

  source = source.replace(mediaAnchor, `${bridgeCss}${mediaAnchor}`);
}

for (const required of [
  marker,
  ':root[data-spire-epic-theme="darkRoom"] #notes-view[data-spire-note-composer-v2="1"]',
  '#notes-view .snc-reader-body',
  '#notes-view .snc-person-name',
  '#notes-view .snc-note-type',
  '#notes-view .snc-note-card.active',
  'var(--epic-bg)',
  'var(--epic-card)',
  'var(--epic-text)',
  'var(--epic-accent)',
]) {
  if (!source.includes(required)) throw new Error(`Spire Notes Dark Room v4 verification failed: missing ${required}`);
}

await writeFile(notePath, source, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', notePath], { encoding:'utf8' });
if (syntax.status !== 0) throw new Error(`Spire Notes Dark Room v4 syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

for (const relative of ['spire/master.html','spire/client-station.html','spire/secure-chat.html','spire/flowsheets.html']) {
  const filePath = path.join(root, relative);
  try { await access(filePath); } catch { continue; }
  let html = await readFile(filePath, 'utf8');
  if (!html.includes('/assets/spire-note-composer-v2.js')) continue;
  html = html.replace(/\/assets\/spire-note-composer-v2\.js(?:\?v=[^"']+)?/g, `/assets/spire-note-composer-v2.js?v=${assetVersion}`);
  await writeFile(filePath, html, 'utf8');
}

console.log('Spire Notes Dark Room v4 installed: the Notes rail, author header, reader, editor, cards, tabs, controls, badges and note body now inherit the active Dark Room palette.');
