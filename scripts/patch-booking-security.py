from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

new_load = r'''  async function loadMonthBookings(year, month){
    const prefix = `${year}-${pad(month+1)}`;
    try{
      const res = await fetch(`${FB_URL}/availability.json?orderBy="$key"&startAt="${prefix}-01"&endAt="${prefix}-31"`);
      if(!res.ok) return {};
      const data = await res.json();
      if(!data) return {};
      const result = {};
      Object.entries(data).forEach(([date, slots]) => {
        if(!slots) return;
        Object.keys(slots).forEach(t => {
          if(slots[t] === true){
            result[date + '|' + t.slice(0,2) + ':' + t.slice(2,4)] = true;
          }
        });
      });
      return result;
    }catch(e){ return {}; }
  }'''

new_save = r'''  async function saveBookingToFirebase(slotKey, bookingData){
    const [date, time] = slotKey.split('|');
    const timeKey = time.replace(':','');
    const updates = {};
    updates[`availability/${date}/${timeKey}`] = true;
    updates[`bookings/${date}/${timeKey}`] = bookingData;
    const res = await fetch(`${FB_URL}/.json`, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(updates)
    });
    if(!res.ok){
      const errText = await res.text().catch(()=>res.statusText);
      throw new Error(`Firebase atomic booking failed (${res.status}): ${errText}`);
    }
    return res.json();
  }'''

new_fresh = r'''  async function isSlotTakenFresh(slotKey){
    const [date, time] = slotKey.split('|');
    const timeKey = time.replace(':','');
    try{
      const res = await fetch(`${FB_URL}/availability/${date}/${timeKey}.json`);
      if(!res.ok) return false;
      const val = await res.json();
      return val === true;
    }catch(e){ return false; }
  }'''

patterns = [
    (r'  async function loadMonthBookings\(year, month\)\{.*?\n  \}', new_load),
    (r'  async function saveBookingToFirebase\(slotKey, bookingData\)\{.*?\n  \}', new_save),
    (r'  async function isSlotTakenFresh\(slotKey\)\{.*?\n  \}', new_fresh),
]
for pat, repl in patterns:
    s2, n = re.subn(pat, repl, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f'Patch target not found exactly once: {pat}')
    s = s2

p.write_text(s, encoding='utf-8')
print('Patched index.html: public availability + atomic booking write + fresh availability check')
