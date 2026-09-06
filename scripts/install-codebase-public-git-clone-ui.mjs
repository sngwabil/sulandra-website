import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target=path.resolve(process.argv[2]||'Codebase.html');
const runtime=path.resolve('assets/codebase-public-git-clone.js');
await access(target);
await access(runtime);
const runtimeSource=await readFile(runtime,'utf8');
if(!runtimeSource.includes('CODEBASE_PUBLIC_GIT_CLONE_UI_V1'))throw new Error('Codebase public Git clone UI marker is missing');
if(!runtimeSource.includes("#codebase-clone-project"))throw new Error('Codebase public Git clone UI does not own the GitHub button');
if(!runtimeSource.includes("window.SulandraCodebaseProjects.clone=cloneGithubProject"))throw new Error('Codebase public Git clone UI does not expose the repaired clone action');

let html=await readFile(target,'utf8');
const tag='<script src="/assets/codebase-public-git-clone.js?v=20260906-public-git-clone-1"></script>';
html=html.replace(/\s*<script src="\/assets\/codebase-public-git-clone\.js(?:\?v=[^\"]*)?"><\/script>\s*/g,'\n');
const projectManagerPattern=/<script src="\/assets\/codebase-project-manager\.js(?:\?v=[^\"]*)?"><\/script>/;
const match=html.match(projectManagerPattern);
if(!match)throw new Error('Codebase project manager runtime must be published before public Git clone repair');
html=html.replace(projectManagerPattern,`${match[0]}\n${tag}`);
const managerIndex=html.indexOf(match[0]);
const repairIndex=html.indexOf(tag,managerIndex+match[0].length);
if(managerIndex<0||repairIndex<=managerIndex)throw new Error('Codebase public Git clone runtime publication order is invalid');
if(html.indexOf(tag,repairIndex+tag.length)!==-1)throw new Error('Codebase public Git clone runtime must be published exactly once');
await writeFile(target,html,'utf8');
console.log(`Published Codebase public Git clone repair in ${target}`);
