import { api } from '../api.js';
import { state, wireNav } from '../state.js';
import { $, esc, fmt } from '../util.js';

export async function eventsView(app) {
  const evs = await api('/events');
  app.innerHTML = `<h2 style="margin-bottom:16px">Shopping events</h2><p class="err" id="msg"></p>` + (evs.map(e => `
  <div class="card"><div class="row"><h3>${esc(e.title)}</h3><span class="chip ${e.status}">${e.status}</span><span class="sp mut" id="d${e.id}"></span></div>
  <p class="mut" style="margin:6px 0 12px">${esc(e.store_name)} · ${esc(e.address || '')}<br>Orders open ${fmt(e.open_at)}, close ${fmt(e.close_at)}${e.shoppers.length ? '<br>Shopper' + (e.shoppers.length > 1 ? 's' : '') + ': ' + esc(e.shoppers.join(', ')) : ''}</p>
  <div class="row">${e.status === 'open' ? `<button class="pri" data-go="order" data-id="${e.id}">Add items</button>` : `<button data-go="order" data-id="${e.id}">My order</button>`}
  ${e.status === 'closed' && (e.isShopper || state.me.role === 'admin') ? `<button class="pri" data-go="shop" data-id="${e.id}">Shopping list</button>` : ''}
  ${e.lat ? `<button data-dist="${e.store_id}" data-ev="${e.id}">How far is it?</button>` : ''}</div></div>`).join('') || '<div class="card">No events yet. An admin can create one.</div>');
  wireNav(app);
  app.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => distance(+b.dataset.dist, +b.dataset.ev));
}

function distance(storeId, eventId) {
  const el = $('#d' + eventId); el.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(async p => {
    try { el.textContent = (await api(`/stores/${storeId}/distance?lat=${p.coords.latitude}&lng=${p.coords.longitude}`)).text; }
    catch (x) { el.textContent = x.message; }
  }, () => { el.textContent = 'Allow location access to see distance.'; });
}
