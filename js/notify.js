/* Notifications (plan item 1.4): exactly ONE opt-in type — the daily
   streak protector. Native builds use Capacitor LocalNotifications;
   the web build is a silent no-op. Never add more push types (cut list:
   "premium feel dies by push spam"). */

const REMINDER_ID = 1;

function plugin(){ return globalThis.Capacitor?.Plugins?.LocalNotifications ?? null; }

export async function setStreakReminder(enabled, streak){
  const ln = plugin();
  if(!ln) return false;
  try{
    if(!enabled){
      await ln.cancel({ notifications: [{ id: REMINDER_ID }] });
      return true;
    }
    const perm = await ln.requestPermissions();
    if(perm.display !== 'granted') return false;
    await ln.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: 'Midnight Garage',
        body: streak >= 2
          ? `Your ${streak}-day streak ends at midnight. One quick puzzle?`
          : 'Tonight’s puzzle is waiting in the garage.',
        schedule: { on: { hour: 20, minute: 30 }, allowWhileIdle: true },
      }],
    });
    return true;
  }catch(e){ return false; }
}
