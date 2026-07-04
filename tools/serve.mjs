#!/usr/bin/env node
/* Zero-dependency static server for local play: `npm run dev` then open
   http://localhost:8080 — ES modules need http(s), file:// won't do. */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try{
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(path === '/') path = '/index.html';
    const file = normalize(join(root, path));
    if(!file.startsWith(root)) throw new Error('traversal');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  }catch(e){
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`Midnight Garage → http://localhost:${port}`));
