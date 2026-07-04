/* Persistence (plan items 0.1 rebrand save keys, 1.2 cloud save hook).
   localStorage on web; Capacitor Preferences when running in the native
   shell (which iCloud key-value sync can back on iOS). All keys are
   Midnight Garage-branded — the prototype's key is gone. */

const PREFIX = 'mg_';

function capPrefs(){
  return globalThis.Capacitor?.Plugins?.Preferences ?? null;
}

export async function load(key, fallback = null){
  try{
    const prefs = capPrefs();
    if(prefs){
      const { value } = await prefs.get({ key: PREFIX + key });
      return value ? JSON.parse(value) : fallback;
    }
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){
    return fallback;
  }
}

export async function store(key, value){
  try{
    const prefs = capPrefs();
    const raw = JSON.stringify(value);
    if(prefs){ await prefs.set({ key: PREFIX + key, value: raw }); return true; }
    localStorage.setItem(PREFIX + key, raw);
    return true;
  }catch(e){
    return false; // storage denied — play session continues in memory
  }
}

export function todayStr(d = new Date()){
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
