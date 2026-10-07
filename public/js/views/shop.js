import { api } from '../api.js';
import { state, wireNav } from '../state.js';
import { esc, say } from '../util.js';

export async function shopView(app) {
  let items;
  try { items = await api(`/events/${state.eid}/shop`); }
  catch (x) { app.innerHTML = `<button data-go="events">← Events</button><p class="err">${esc(x.message)}</p>`; return wireNav(app); }
  const groups = {};
  items.forEach(i => (groups[i.location || 'No location'] ??= []).push(i));
  app.innerHTML = `<button data-go="events">← Events</button><h2 style="margin:14px 0">Shopping list</h2><p class="mut">${items.filter(i => i.picked_by).length} of ${items.length} items picked up. Grouped by place in store.</p><p class="err" id="msg"></p>` +
    Object.entries(groups).map(([loc, list]) => `<div class="card"><h3>${esc(loc)}</h3>${list.map(i => `<label class="line ${i.picked_by ? 'done' : ''}" style="font-weight:400;font-size:1rem"><input type="checkbox" data-pick="${i.id}" ${i.picked_by ? 'checked' : ''}><span class="n">${esc(i.name)} ×${i.qty}<br><span class="mut">for ${esc(i.buyer)}${i.org ? ' · ' + esc(i.org) : ''}</span></span></label>`).join('')}</div>`).join('');
  wireNav(app);
  app.querySelectorAll('[data-pick]').forEach(box => box.onchange = async () => {
    try {
      const r = await api(`/items/${box.dataset.pick}/pick`, 'POST', { picked: box.checked });
      await shopView(app);
      if (!r.ok) say('Someone else already marked this item.');
    } catch (x) { say(x.message); }
  });
}
