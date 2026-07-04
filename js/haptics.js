/* Haptics bridge (plan item 0.4). Native: Capacitor Haptics →
   UIImpactFeedbackGenerator. Web fallback: navigator.vibrate. Patterns:
     tick       — light, one per cell crossed while dragging
     thud       — medium, piece stops against a wall/car
     thudHeavy  — heavy, a truck stops
     success    — notification pattern on win
     ui         — selection changed */

let enabled = true;
export function setHapticsEnabled(v){ enabled = v; }

function cap(){ return globalThis.Capacitor?.Plugins?.Haptics ?? null; }

export function haptic(kind){
  if(!enabled) return;
  const h = cap();
  try{
    if(h){
      if(kind === 'tick')            h.impact({ style: 'LIGHT' });
      else if(kind === 'thud')       h.impact({ style: 'MEDIUM' });
      else if(kind === 'thudHeavy')  h.impact({ style: 'HEAVY' });
      else if(kind === 'success')    h.notification({ type: 'SUCCESS' });
      else if(kind === 'ui')         h.selectionChanged?.();
      return;
    }
    if(navigator.vibrate){
      const patterns = { tick: 4, thud: 14, thudHeavy: 26, success: [18, 40, 18, 40, 34], ui: 6 };
      navigator.vibrate(patterns[kind] ?? 6);
    }
  }catch(e){ /* haptics are garnish — never break play */ }
}
