import fs from 'node:fs';

const target = process.argv[2] || '/app/server.mjs';
let source = fs.readFileSync(target, 'utf8');

const oldScan = `      const top = await container.top({ ps_args: '-eo args' });
      const commandText = (top.Processes || []).map(row => row.join(' ')).join('\\n');`;
const newScan = `      // Docker's top endpoint requires a PID column in the ps output.
      // Keep PID for API compatibility but exclude it from the command matcher.
      const top = await container.top({ ps_args: '-eo pid,args' });
      const commandText = (top.Processes || []).map(row => row.slice(1).join(' ')).join('\\n');`;

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
