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
  '--user-data-dir "${CODE_SERVER_DATA}"',
  '--bind-addr "127.0.0.1:${IDE_PORT}"',
]){
  if(!source.includes(marker))throw new Error(`Sulandra IDE settings verification missing ${marker}`);
}
if(source.includes('"workbench.startupEditor": "none"'))throw new Error('Sulandra IDE must retain the normal Welcome/Start page');
if(/"workbench\.colorTheme"\s*:\s*"[^"]*Light/i.test(source))throw new Error('Sulandra IDE must never default to a light workbench theme');
if(!source.includes('"chat.disableAIFeatures"'))throw new Error('AI-disable setting is not preserved across IDE profiles');

const settingsMatch=source.match(/cat > \"\$\{CODE_SERVER_DATA\}\/User\/settings\.json\" <<'JSON'\n([\s\S]*?)\nJSON\n/);
if(!settingsMatch)throw new Error('Unable to locate generated Sulandra IDE settings JSON');
let settings;
try{settings=JSON.parse(settingsMatch[1])}catch(error){throw new Error(`Generated Sulandra IDE settings are invalid JSON: ${error.message}`)}

if(settings['workbench.colorTheme']!=='Default Dark Modern')throw new Error('Sulandra IDE dark workbench theme is not the generated default');
if(settings['window.autoDetectColorScheme']!==false)throw new Error('Host/browser color scheme must not override the Sulandra IDE theme');
if(settings['chat.disableAIFeatures']!==true)throw new Error('Upstream IDE AI must stay disabled');
if(settings['workbench.startupEditor']!=='welcomePage')throw new Error('Normal Welcome/Start page must remain enabled');

const colors=settings['workbench.colorCustomizations']||{};
const requiredColors={
  'editor.background':'#06131D',
  'sideBar.background':'#071925',
  'activityBar.background':'#06131D',
  'panel.background':'#06131D',
  'terminal.background':'#06131D',
  'statusBar.background':'#0C2A3B',
  'welcomePage.background':'#06131D',
  'focusBorder':'#24D389',
  'editorCursor.foreground':'#50E39A',
};
for(const [key,value] of Object.entries(requiredColors)){
  if(colors[key]!==value)throw new Error(`Sulandra IDE theme mismatch for ${key}: expected ${value}, found ${colors[key]||'missing'}`);
}

const applyToAll=new Set(settings['workbench.settings.applyToAllProfiles']||[]);
for(const key of ['chat.disableAIFeatures','workbench.colorTheme','workbench.colorCustomizations','editor.tokenColorCustomizations']){
  if(!applyToAll.has(key))throw new Error(`Sulandra IDE profile inheritance is missing ${key}`);
}

console.log('Sulandra IDE settings verification passed: generated settings JSON is valid, the navy/teal engineering theme is enforced across profiles, normal editor entry points remain available, upstream AI is disabled, and the IDE remains loopback-only.');
