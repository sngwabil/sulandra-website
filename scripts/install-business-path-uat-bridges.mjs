import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

async function verifyStandaloneSpireMaster() {
  const masterPath = path.join(
    root,
    'spire',
    'master.html'
  );

  try {
    await access(masterPath);

    const masterHtml = await readFile(
      masterPath,
      'utf8'
    );

    if (
      !masterHtml.includes('<html') ||
      !masterHtml.includes('</html>')
    ) {
      throw new Error(
        '/spire/master.html does not appear to be a complete HTML application.'
      );
    }

    console.log(
      'Standalone SPIRE master architecture detected. ' +
      'Legacy idempotent shell installation is not required.'
    );
  } catch (error) {
    console.error(
      'SPIRE master verification failed:',
      error
    );

    process.exit(1);
  }
}

await verifyStandaloneSpireMaster();
