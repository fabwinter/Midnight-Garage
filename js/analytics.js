/* Analytics instrumentation (plan item 0.9 — "before launch,
   non-negotiable"). Privacy-clean: random device id, no PII, events are
   game facts only. Events queue locally and batch-flush to Supabase REST
   when js/config.js provides credentials; without config they stay in a
   capped local ring buffer so the funnel code paths are exercised from
   day one. Schema: supabase/schema.sql. */

import { load, store } from './storage.js';
import { CONFIG } from './config.js';

const QUEUE_KEY = 'events_v1';
const QUEUE_CAP = 600;
const BATCH = 25;
const FLUSH_MS = 30000;

let queue = [];
let deviceId = null;
let sessionId = null;
let started = false;

export async function initAnalytics(){
  queue = (await load(QUEUE_KEY, [])) ?? [];
  deviceId = await load('did');
  if(!deviceId){
    deviceId = 'd_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    await store('did', deviceId);
  }
  sessionId = 's_' + Math.random().toString(36).slice(2, 12);
  started = true;
  track('session_start', {});
  setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){ track('session_end', {}); flush(); }
    else { sessionId = 's_' + Math.random().toString(36).slice(2, 12); track('session_start', {}); }
  });
}

let persistT = null;
export function track(name, props = {}){
  if(!started) return;
  queue.push({ device_id: deviceId, session_id: sessionId, name, props, client_ts: new Date().toISOString() });
  if(queue.length > QUEUE_CAP) queue = queue.slice(-QUEUE_CAP);
  clearTimeout(persistT);
  persistT = setTimeout(() => store(QUEUE_KEY, queue), 800);
  if(queue.length >= BATCH) flush();
}

let flushing = false;
export async function flush(){
  if(flushing || !queue.length) return;
  if(!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return;  // offline mode: keep local
  flushing = true;
  const batch = queue.slice(0, BATCH * 2);
  try{
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if(res.ok){
      queue = queue.slice(batch.length);
      store(QUEUE_KEY, queue);
    }
  }catch(e){ /* offline — retry next interval */ }
  flushing = false;
}
