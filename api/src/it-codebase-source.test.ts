import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCodebaseReadablePath, isCodebaseBinaryPath, isCodebasePathBlocked, normalizeCodebasePath } from './it-codebase-source.js';

describe('Sulandra Codebase server source policy',()=>{
  it('accepts normal release source paths',()=>{
    assert.equal(normalizeCodebasePath('api/src/it-solutions-routes.ts'),'api/src/it-solutions-routes.ts');
    assert.equal(isCodebasePathBlocked('README.md'),false);
    assert.equal(assertCodebaseReadablePath('assets/sulandra-codebase.js'),'assets/sulandra-codebase.js');
  });

  it('rejects traversal and absolute path forms',()=>{
    for(const path of ['../server.js','api/../server.js','/etc/passwd','C:\\Windows\\system.ini','api\\src\\server.ts','././server.js'])assert.equal(normalizeCodebasePath(path),null);
  });

  it('blocks secrets, credentials, private keys and dependency metadata',()=>{
    for(const path of ['.env','.env.production','api/.env.local','.git/config','node_modules/pkg/index.js','.ssh/config','credentials.json','config/service-account.json','id_rsa','cert/private.pem','signing.key'])assert.equal(isCodebasePathBlocked(path),true);
  });

  it('classifies binary source-view exclusions',()=>{
    for(const path of ['assets/logo.png','docs/form.pdf','cache/archive.zip','data/app.db'])assert.equal(isCodebaseBinaryPath(path),true);
    assert.equal(isCodebaseBinaryPath('api/src/server.ts'),false);
  });

  it('throws before a blocked path can reach GitHub',()=>{
    assert.throws(()=>assertCodebaseReadablePath('.env.production'),/source policy/i);
    assert.throws(()=>assertCodebaseReadablePath('private.pem'),/source policy/i);
    assert.throws(()=>assertCodebaseReadablePath('assets/logo.png'),/binary/i);
  });
});
