import { readFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node verify-terminal-ide-settings.mjs <entrypoint.sh>');
const source=await readFile(target,'utf8');
for(const marker of [
  '"chat.disableAIFeatures": true',
  '"workbench.startupEditor": "welcomePage"',
  '"workbench.welcomePage.walkthroughs.openOnInstall": false',
  '--user-data-dir "${CODE_SERVER_DATA}"',
  '--bind-addr "127.0.0.1:${IDE_PORT}"',
]){
  if(!source.includes(marker))throw new Error(`Sulandra IDE settings verification missing ${marker}`);
}
if(source.includes('"workbench.startupEditor": "none"'))throw new Error('Sulandra IDE must retain the normal Welcome/Start page');
if(!source.includes('"chat.disableAIFeatures"'))throw new Error('AI-disable setting is not preserved across IDE profiles');
console.log('Sulandra IDE settings verification passed: normal Welcome/Start entry points are restored, upstream AI onboarding is disabled, and the IDE remains loopback-only.');
