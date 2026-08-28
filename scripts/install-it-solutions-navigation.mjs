import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const portalPath=path.join(dist,'it-solutions.html');
const portal=await readFile(portalPath,'utf8');
for(const marker of ['Sulandra IT Solutions','Operations Overview','Resolved Compliance Archive']){
  if(!portal.includes(marker))throw new Error(`Published IT Solutions portal missing ${marker}`);
}

const topLauncher='        <li><a href="/it-solutions.html">IT Solutions</a></li>';
const sideLauncher='          <button class="side-btn" type="button" onclick="window.location.href=\'/it-solutions.html\'">IT Solutions <small>Support & Diagnostics</small></button>';
const topAnchor=/<li><a href=["']spire-admin\.html["']>Admin Spire<\/a><\/li>/;
const sideAnchor=/<button class="side-btn" type="button" onclick="window\.location\.href=["']spire-admin\.html["']">Admin Spire <small>Clinical<\/small><\/button>/;

for(const name of ['admin.html','admin-operations.html']){
  const target=path.join(dist,name);
  let html=await readFile(target,'utf8');
  if(!html.includes('href="/it-solutions.html"')){
    if(!topAnchor.test(html))throw new Error(`${name} is missing the Admin Spire top-navigation anchor for IT Solutions`);
    html=html.replace(topAnchor,match=>`${match}\n${topLauncher}`);
  }
  if(!html.includes("window.location.href='/it-solutions.html'")){
    if(!sideAnchor.test(html))throw new Error(`${name} is missing the Admin Spire sidebar anchor for IT Solutions`);
    html=html.replace(sideAnchor,match=>`${match}\n${sideLauncher}`);
  }
  await writeFile(target,html,'utf8');
  const published=await readFile(target,'utf8');
  for(const marker of ['href="/it-solutions.html"',"window.location.href='/it-solutions.html'",'>IT Solutions<']){
    if(!published.includes(marker))throw new Error(`${name} failed to publish IT Solutions launcher ${marker}`);
  }
}

console.log('IT Solutions launchers published in both canonical Admin desktops without replacing their existing navigation architecture.');
