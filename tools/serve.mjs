#!/usr/bin/env node
/* Zero-dependency static server for local play: `npm run dev` then open
   http://localhost:8080 — ES modules need http(s), file:// won't do. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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
  '.mp3': 'audio/mpeg',
};
// Images/audio are the bulk of a level's payload (car/truck art, music) and
// rarely change file-to-file once shipped — without this, plain HTTP
// responses have no caching signal at all, so every level/replay re-fetches
// every asset from disk over the network instead of the browser's own
// cache. A day is long enough to erase repeat-view cost within a session,
// short enough that a reprocessed asset (same filename, new pixels — this
// happens during active art work) still surfaces same-day rather than
// being masked for months by an `immutable` cache.
const CACHEABLE = new Set(['.png', '.mp3']);

createServer(async (req, res) => {
  try{
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(path === '/') path = '/index.html';
    const file = normalize(join(root, path));
    if(!file.startsWith(root)) throw new Error('traversal');
    const ext = extname(file);
    const type = types[ext] ?? 'application/octet-stream';
    const cacheHeaders = CACHEABLE.has(ext) ? { 'Cache-Control': 'public, max-age=86400' } : {};
    const { size } = await stat(file);
    const range = req.headers.range;
    // Media elements issue Range requests; answering plain 200 to those
    // confuses Chromium into resetting the connection — honor them properly.
    if(range){
      const [, startStr, endStr] = /bytes=(\d*)-(\d*)/.exec(range) ?? [];
      const start = startStr ? Number(startStr) : 0;
      const end = endStr ? Number(endStr) : size - 1;
      const body = await readFile(file);
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        ...cacheHeaders,
      });
      res.end(body.subarray(start, end + 1));
    } else {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size, ...cacheHeaders });
      res.end(body);
    }
  }catch(e){
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`Midnight Garage → http://localhost:${port}`));
