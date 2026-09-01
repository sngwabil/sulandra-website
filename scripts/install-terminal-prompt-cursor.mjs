import { readFile, writeFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node install-terminal-prompt-cursor.mjs <server.mjs>');
let source=await readFile(target,'utf8');
const marker='SULANDRA_PROMPT_CURSOR_RESTORE_V2';
if(!source.includes(marker)){
  const anchor="  HISTFILESIZE: '-1',\n";
  if(!source.includes(anchor))throw new Error('Terminal prompt cursor anchor missing');
  source=source.replace(anchor,anchor+"  // "+marker+"\n  // Flush every accepted Bash command to the persistent workspace history file,\n  // then restore the visible terminal cursor whenever the prompt returns.\n  PROMPT_COMMAND: 'history -a; history -n; printf \\\"\\\\033[?25h\\\"',\n");
}
await writeFile(target,source,'utf8');
console.log(`Installed persistent Bash history and prompt cursor restoration into ${target}`);
