import { readFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node verify-terminal-ide-settings.mjs <entrypoint.sh>');
const source=await readFile(target,'utf8');
for(const marker of [
  '"chat.disableAIFeatures": true',
  '"workbench.startupEditor": "welcomePage"',
  '"workbench.welcomePage.walkthroughs.openOnInstall": false',
  '"window.autoDetectColorScheme": false',
  '"workbench.colorTheme": "Default Dark Modern"',
  '"workbench.colorCustomizations"',
  '"editor.tokenColorCustomizations"',
  '"editor.background": "#06131D"',
  '"sideBar.background": "#071925"',
  '"activityBar.background": "#06131D"',
  '"panel.background": "#06131D"',
  '"terminal.background": "#06131D"',
  '"statusBar.background": "#0C2A3B"',
  '"welcomePage.background": "#06131D"',
  '"focusBorder": "#24D389"',
  '"editorCursor.foreground": "#50E39A"',
  '"workbench.colorTheme"',
  '"workbench.colorCustomizations"',
  '"editor.tokenColorCustomizations"',
  '--user-data-dir "${CODE_SERVER_DATA}"',
  '--bind-addr "127.0.0.1:${IDE_PORT}"',
]){
  if(!source.includes(marker))throw new Error(`Sulandra IDE settings verification missing ${marker}`);
}
if(source.includes('"workbench.startupEditor": "none"'))throw new Error('Sulandra IDE must retain the normal Welcome/Start page');
if(/"workbench\.colorTheme"\s*:\s*"[^"]*Light/i.test(source))throw new Error('Sulandra IDE must never default to a light workbench theme');
if(!source.includes('"chat.disableAIFeatures"'))throw new Error('AI-disable setting is not preserved across IDE profiles');
console.log('Sulandra IDE settings verification passed: the IDE retains normal editor entry points, uses the Sulandra navy/teal engineering theme, keeps upstream AI disabled, and remains loopback-only.');
