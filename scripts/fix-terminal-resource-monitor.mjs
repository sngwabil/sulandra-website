import fs from 'node:fs';

const target = process.argv[2] || '/app/server.mjs';
let source = fs.readFileSync(target, 'utf8');

const oldScan = `      const top = await container.top({ ps_args: '-eo args' });
      const commandText = (top.Processes || []).map(row => row.join(' ')).join('\\n');`;
const newScan = `      // Docker's top endpoint requires a PID column on some daemon/host ps
      // combinations. Use it as the fast path, then fall back to ps inside the
      // session container so recovered sessions are not dependent on host ps
      // formatting semantics.
      let commandText = '';
      try {
        const top = await container.top({ ps_args: '-eo pid,args' });
        commandText = (top.Processes || []).map(row => row.slice(1).join(' ')).join('\\n');
      } catch (error) {
        console.warn(\`[terminal-executor] docker top scan failed session=\${session.id}: \${error?.message || error}\`);
      }
      if (!buildProcessPattern.test(commandText)) {
        try {
          const exec = await container.exec({
            Cmd: ['ps', '-eo', 'args'],
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
          });
          const stream = await exec.start({ hijack: true, stdin: false });
          let containerPs = '';
          for await (const chunk of stream) containerPs += chunk.toString();
          commandText = \`${commandText}\\n\${containerPs}\`;
        } catch (error) {
          console.warn(\`[terminal-executor] in-container ps scan failed session=\${session.id}: \${error?.message || error}\`);
        }
      }`;

if (!source.includes(oldScan)) {
  throw new Error('Terminal resource monitor patch failed: process scan signature not found');
}
source = source.replace(oldScan, newScan);

const oldCatch = `    } catch {}
  }
}, buildScanMs);`;
const newCatch = `    } catch (error) {
      console.warn(\`[terminal-executor] resource monitor failed session=\${session.id}: \${error?.message || error}\`);
    }
  }
}, buildScanMs);`;

if (!source.includes(oldCatch)) {
  throw new Error('Terminal resource monitor patch failed: monitor catch signature not found');
}
source = source.replace(oldCatch, newCatch);

fs.writeFileSync(target, source);
console.log(`Fixed terminal resource monitor in ${target}`);
