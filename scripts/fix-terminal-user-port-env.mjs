import fs from 'node:fs';

const target=process.argv[2];
if(!target)throw new Error('Usage: node fix-terminal-user-port-env.mjs <session-agent-server.mjs>');
let source=fs.readFileSync(target,'utf8');
const marker='TERMINAL_USER_PORT_ENV_ISOLATION_V1';
if(source.includes(marker)){console.log('Terminal user PORT isolation already installed.');process.exit(0)}

const anchor="  SULANDRA_TERMINAL_HISTORY_FILE: historyPath,\n};\n\nconst broadcast = data => {";
if(!source.includes(anchor))throw new Error('Terminal shell environment anchor changed');
const replacement=`  SULANDRA_TERMINAL_HISTORY_FILE: historyPath,\n};\n\n/* ${marker}\n * PORT and SULANDRA_IDE_PORT belong to the Codebase control plane. They must\n * never leak into the interactive developer shell because frameworks commonly\n * consume process.env.PORT and would otherwise try to bind the reserved agent\n * port instead of their normal local development port.\n */\ndelete shellEnv.PORT;\ndelete shellEnv.SULANDRA_IDE_PORT;\n\nconst broadcast = data => {`;
source=source.replace(anchor,replacement);
for(const required of [marker,'delete shellEnv.PORT;','delete shellEnv.SULANDRA_IDE_PORT;']){
  if(!source.includes(required))throw new Error(`Terminal user PORT isolation verification missing: ${required}`);
}
fs.writeFileSync(target,source);
console.log('Installed Codebase terminal user PORT environment isolation.');
