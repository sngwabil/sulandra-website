import { describe, expect, it } from 'vitest';
import { assertCodebaseReadablePath, isCodebaseBinaryPath, isCodebasePathBlocked, normalizeCodebasePath } from './it-codebase-source.js';

describe('Sulandra Codebase server source policy',()=>{
  it('accepts normal release source paths',()=>{
    expect(normalizeCodebasePath('api/src/it-solutions-routes.ts')).toBe('api/src/it-solutions-routes.ts');
    expect(isCodebasePathBlocked('README.md')).toBe(false);
    expect(assertCodebaseReadablePath('assets/sulandra-codebase.js')).toBe('assets/sulandra-codebase.js');
  });

  it('rejects traversal and absolute path forms',()=>{
    for(const path of ['../server.js','api/../server.js','/etc/passwd','C:\\Windows\\system.ini','api\\src\\server.ts','././server.js'])expect(normalizeCodebasePath(path)).toBeNull();
  });

  it('blocks secrets, credentials, private keys and dependency metadata',()=>{
    for(const path of ['.env','.env.production','api/.env.local','.git/config','node_modules/pkg/index.js','.ssh/config','credentials.json','config/service-account.json','id_rsa','cert/private.pem','signing.key'])expect(isCodebasePathBlocked(path)).toBe(true);
  });

  it('classifies binary source-view exclusions',()=>{
    for(const path of ['assets/logo.png','docs/form.pdf','cache/archive.zip','data/app.db'])expect(isCodebaseBinaryPath(path)).toBe(true);
    expect(isCodebaseBinaryPath('api/src/server.ts')).toBe(false);
  });

  it('throws before a blocked path can reach GitHub',()=>{
    expect(()=>assertCodebaseReadablePath('.env.production')).toThrow(/source policy/i);
    expect(()=>assertCodebaseReadablePath('private.pem')).toThrow(/source policy/i);
    expect(()=>assertCodebaseReadablePath('assets/logo.png')).toThrow(/binary/i);
  });
});
