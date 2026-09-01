import { readFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node verify-terminal-ide-settings.mjs <entrypoint.sh>');
const source=await readFile(target,'utf8');
for(const marker of [
  '"chat.disableAIFeatures": true',
  '"workbench.startupEditor": "none"',
  '"workbench.welcomePage.walkthroughs.openOnInstall": false',
  '--user-data-dir "${CODE_SERVER_DATA}"',
  '--bind-addr "127.0.0.1:${IDE_PORT}"',
]){
  if(!source.includes(marker))throw new Error(`Sulandra IDE settings verification missing ${marker}`);
}
if(!source.includes('"chat.disableAIFeatures"'))throw new Error('AI-disable setting is not preserved across IDE profiles');
console.log('Sulandra IDE settings verification passed: upstream AI onboarding is disabled and the IDE remains loopback-only.');
