import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repositoryRoot, 'api', 'src', 'onboarding-bootstrap.ts');
let source = await readFile(sourcePath, 'utf8');

const loginAccountType = `type LoginAccount = AuthContext & {
  email: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
};`;

const portalLoginAccountType = `${loginAccountType}

type PortalLoginAccount = LoginAccount & {
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};`;

if (!source.includes('type PortalLoginAccount = LoginAccount &')) {
  if (!source.includes(loginAccountType)) {
    throw new Error('Unable to locate LoginAccount type declaration.');
  }
  source = source.replace(loginAccountType, portalLoginAccountType);
}

source = source.replace(
  'const resolvePortalAccount = async (identifier: string): Promise<LoginAccount | null> => {',
  'const resolvePortalAccount = async (identifier: string): Promise<PortalLoginAccount | null> => {',
);

source = source.replace(
  `  } as LoginAccount & {
    passwordHash: string | null;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  };
};`,
  `  };
};`,
);

await writeFile(sourcePath, source, 'utf8');
console.log('Login account TypeScript types are ready.');
