import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portal=await readFile(path.join(root,'it-solutions.html'),'utf8');
for(const marker of ['Sulandra IT Solutions','Operations Overview','Resolved Compliance Archive']){
  if(!portal.includes(marker))throw new Error(`IT Solutions portal missing ${marker}`);
}

const topLauncher='        <li><a href="/it-solutions.html">IT Solutions</a></li>';
const sideLauncher='          <button class="side-btn" type="button" onclick="window.location.href=\'/it-solutions.html\'">IT Solutions <small>Support & Diagnostics</small></button>';
const topSpire=/<li>\s*<a\b[^>]*href=["'][^"']*spire-admin\.html["'][^>]*>\s*Admin Spire\s*<\/a>\s*<\/li>/i;
const topSettings=/<li>\s*<a\b[^>]*data-module=["']settings["'][^>]*>\s*Settings\s*<\/a>\s*<\/li>/i;
const sideSpire=/<button\b[^>]*class=["'][^"']*side-btn[^"']*["'][^>]*onclick=["'][^"']*spire-admin\.html[^"']*["'][^>]*>\s*Admin Spire\s*<small>\s*Clinical\s*<\/small>\s*<\/button>/i;
const sideSettings=/<button\b[^>]*class=["'][^"']*side-btn[^"']*["'][^>]*data-module=["']settings["'][^>]*>\s*Settings\s*<small>[^<]*<\/small>\s*<\/button>/i;

function insertTop(html,name){
  if(html.includes('href="/it-solutions.html"')) return html;
  if(topSpire.test(html)) return html.replace(topSpire,match=>`${match}\n${topLauncher}`);
  if(topSettings.test(html)) return html.replace(topSettings,match=>`${topLauncher}\n${match}`);
  const navMatch=html.match(/(<ul\b[^>]*class=["'][^"']*nav-links[^"']*["'][^>]*>)([\s\S]*?)(<\/ul>)/i);
  if(navMatch){
    const replacement=`${navMatch[1]}${navMatch[2]}\n${topLauncher}\n${navMatch[3]}`;
    return html.replace(navMatch[0],replacement);
  }
  throw new Error(`${name} has no canonical top-navigation insertion point for IT Solutions`);
}

function insertSide(html,name){
  if(html.includes("window.location.href='/it-solutions.html'")) return html;
  if(sideSpire.test(html)) return html.replace(sideSpire,match=>`${match}\n${sideLauncher}`);
  if(sideSettings.test(html)) return html.replace(sideSettings,match=>`${sideLauncher}\n${match}`);
  const sideMatch=html.match(/(<div\b[^>]*class=["'][^"']*side-btns[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i);
  if(sideMatch){
    const replacement=`${sideMatch[1]}${sideMatch[2]}\n${sideLauncher}\n${sideMatch[3]}`;
    return html.replace(sideMatch[0],replacement);
  }
  throw new Error(`${name} has no canonical sidebar insertion point for IT Solutions`);
}

async function publish(target,name){
  let html=await readFile(target,'utf8');
  html=insertTop(html,name);
  html=insertSide(html,name);
  await writeFile(target,html,'utf8');
  const published=await readFile(target,'utf8');
  for(const marker of ['href="/it-solutions.html"',"window.location.href='/it-solutions.html'",'>IT Solutions<']){
    if(!published.includes(marker))throw new Error(`${name} failed to publish IT Solutions launcher ${marker}`);
  }
}

// Install into canonical source before static publication. This keeps the owner
// Admin invariant intact: dist-web is copied from the canonical Admin source,
// rather than rewriting the owner desktop after publication.
for(const name of ['admin.html','admin-operations.html']){
  await publish(path.join(root,name),name);
}

// The script is intentionally idempotent. When invoked after static publication,
// verify/preserve the already-canonical launchers instead of introducing a delta.
const dist=path.join(root,'dist-web');
try{
  await access(dist);
  for(const name of ['admin.html','admin-operations.html']){
    await publish(path.join(dist,name),`dist-web/${name}`);
  }
  const distPortal=await readFile(path.join(dist,'it-solutions.html'),'utf8');
  for(const marker of ['Sulandra IT Solutions','Operations Overview','Resolved Compliance Archive']){
    if(!distPortal.includes(marker))throw new Error(`Published IT Solutions portal missing ${marker}`);
  }
}catch(error){
  if(error?.code!=='ENOENT')throw error;
}

console.log('IT Solutions launchers installed in canonical Admin source so static publication preserves both Admin architectures without post-publication rewriting.');
