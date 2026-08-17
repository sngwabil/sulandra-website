import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stationPath = path.join(root, 'spire', 'client-station.html');
const marker = 'SPIRE_CLIENT_STATION_DARKROOM_CHROME_V8';

await access(stationPath);
let html = await readFile(stationPath, 'utf8');

const styleBlock = `
  <style id="spireClientStationDarkRoomChromeV8" data-spire-client-station-darkroom="${marker}">
    /* ${marker}: visual-only Dark Room exceptions for branded chrome, company context, and alerts. */
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .spire-mark,
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .spire-mark.spire-darkroom-v4-text{
      background:#ffffff!important;
      color:#a20d18!important;
      -webkit-text-fill-color:#a20d18!important;
      border:1px solid #d8dee8!important;
      text-shadow:none!important;
      opacity:1!important;
    }

    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #sulandraCompanySwitcher{
      background:#101e36!important;
      color:#f2f5fb!important;
      -webkit-text-fill-color:#f2f5fb!important;
      border:1px solid #3a4a63!important;
      box-shadow:none!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #sulandraCompanySwitcher > span,
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #sulandraCompanySwitcher > span.spire-darkroom-v4-text{
      color:#aebbd0!important;
      -webkit-text-fill-color:#aebbd0!important;
      opacity:1!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #sulandraCompanySwitcher select{
      background:#0d1930!important;
      color:#f2f5fb!important;
      -webkit-text-fill-color:#f2f5fb!important;
      border:1px solid #3a4a63!important;
      border-radius:5px!important;
      padding:3px 24px 3px 7px!important;
      color-scheme:dark!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #sulandraCompanySwitcher option{
      background:#0d1930!important;
      color:#f2f5fb!important;
    }

    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNotifications{
      min-width:34px!important;
      min-height:29px!important;
      display:inline-grid!important;
      place-items:center!important;
      background:#2b210f!important;
      color:#ffd28a!important;
      -webkit-text-fill-color:#ffd28a!important;
      border:1px solid #d4871c!important;
      box-shadow:inset 0 0 0 1px rgba(255,210,138,.08)!important;
      opacity:1!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNotifications:hover,
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNotifications:focus-visible{
      background:#3a2a11!important;
      border-color:#ffb13b!important;
      outline:2px solid #ffb13b!important;
      outline-offset:1px!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNotificationBadge{
      background:#ff4058!important;
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      border:1px solid #ffd7dd!important;
      box-shadow:0 0 0 2px #060c17!important;
      opacity:1!important;
    }

    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .flag,
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] .flag.spire-darkroom-v4-text{
      background:#3a250f!important;
      color:#ffd28a!important;
      -webkit-text-fill-color:#ffd28a!important;
      border:1px solid #d4871c!important;
      box-shadow:inset 0 0 0 1px rgba(255,210,138,.08)!important;
      font-weight:900!important;
      opacity:1!important;
    }

    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel{
      background:#0d1930!important;
      color:#f2f5fb!important;
      border:1px solid #3a4a63!important;
      box-shadow:0 18px 50px rgba(0,0,0,.72)!important;
      z-index:120!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel .notice-head{
      background:#16233d!important;
      color:#ffd28a!important;
      -webkit-text-fill-color:#ffd28a!important;
      border-bottom:1px solid #4b5d78!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel .notice-item{
      background:#101e36!important;
      color:#f2f5fb!important;
      -webkit-text-fill-color:#f2f5fb!important;
      border-bottom:1px solid #3a4a63!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel .notice-item:hover{
      background:#162b49!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel .notice-item strong{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel .notice-item span{
      color:#dbe7f7!important;
      -webkit-text-fill-color:#dbe7f7!important;
    }
    :root[data-spire-epic-theme="darkRoom"] body[data-spire-client-station] #clientStationNoticePanel :is(.notice-item small,.notice-empty){
      color:#aebbd0!important;
      -webkit-text-fill-color:#aebbd0!important;
      opacity:1!important;
    }
  </style>`;

if (html.includes('id="spireClientStationDarkRoomChromeV8"')) {
  html = html.replace(/\n?\s*<style id="spireClientStationDarkRoomChromeV8"[\s\S]*?<\/style>/, styleBlock);
} else {
  if (!html.includes('</head>')) throw new Error('Client Station Dark Room v8 could not find </head>');
  html = html.replace('</head>', `${styleBlock}\n</head>`);
}

html = html.replace('<title>S.P.I.R.E. Client Station | Sulandra Health</title>', '<title>Spire Client Station | Sulandra Health</title>');

for (const required of [
  marker,
  '#sulandraCompanySwitcher',
  '#clientStationNotifications',
  '#clientStationNotificationBadge',
  '#clientStationNoticePanel',
  '.flag.spire-darkroom-v4-text',
  '.spire-mark.spire-darkroom-v4-text',
]) {
  if (!html.includes(required)) throw new Error(`Client Station Dark Room v8 verification failed: missing ${required}`);
}

await writeFile(stationPath, html, 'utf8');
console.log('Spire Client Station Dark Room v8 installed: logo contrast, company selector, alert bell, alert pills, and notification panel are readable in Dark Room.');
