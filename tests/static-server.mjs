import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist-web');
const port=Number(process.env.TEST_STATIC_PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url||'/',`http://${req.headers.host}`).pathname);let target=path.resolve(root,`.${pathname==='/'?'/employee360.html':pathname}`);if(!target.startsWith(root))throw new Error('Invalid path');const info=await stat(target);if(info.isDirectory())target=path.join(target,'index.html');const body=await readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found')}}).listen(port,'127.0.0.1',()=>console.log(`Static test server listening on ${port}`));
