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

const profileMarker='SULANDRA_PROFESSIONAL_BASH_PROFILE_V1';
if(!source.includes(profileMarker)){
  const launchAnchor="  const args = ['-f', tmuxConfigPath, 'new-session', '-A', '-s', tmuxSession, '/bin/bash', '--noprofile', '--norc', '-i'];\n";
  if(!source.includes(launchAnchor))throw new Error('Terminal Bash launch anchor missing');
  source=source.replace(
    launchAnchor,
    "  // "+profileMarker+"\n"+
    "  // Load the immutable Sulandra interactive profile instead of bypassing all Bash rc files.\n"+
    "  const args = ['-f', tmuxConfigPath, 'new-session', '-A', '-s', tmuxSession, '/bin/bash', '--rcfile', '/agent/bashrc', '-i'];\n"
  );
}

await writeFile(target,source,'utf8');
console.log(`Installed persistent Bash history, prompt cursor restoration, and professional Bash profile into ${target}`);
