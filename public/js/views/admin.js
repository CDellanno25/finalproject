import { api } from '../api.js';
import { go } from '../state.js';
import { $, act, esc, fd, usd } from '../util.js';

export async function adminView(app) {
  const [stores, users, evs] = await Promise.all([api('/stores'), api('/users'), api('/events')]);
  app.innerHTML = `<h2 style="margin-bottom:16px">Admin</h2><p class="err" id="msg"></p>
  <div class="card"><h3 style="margin-bottom:10px">Add a store</h3><form id="ns"><label>Name<input name="name" required></label><label>Address<input name="address"></label><label>Latitude<input name="lat" type="number" step="any"></label><label>Longitude<input name="lng" type="number" step="any"></label><label>Sales tax %<input name="tax_rate" type="number" step="0.01" value="0"></label><button>Save store</button></form></div>
  <div class="card"><h3 style="margin-bottom:10px">Create a shopping event</h3>${stores.length ? `<form id="ne"><label>Title<input name="title" required placeholder="9/22 Target Run"></label><label>Store<select name="store_id">${stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
  <label>Opens<input name="open_at" type="datetime-local" required></label><label>Closes<input name="close_at" type="datetime-local" required></label><label>Your Venmo handle<input name="venmo_handle" required placeholder="@yourname"></label><label>Flat fee ($)<input name="fee" type="number" step="0.01" value="0"></label>
  <label>Shoppers<select name="shopper_ids" multiple size="4">${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><button class="pri">Create event</button></form>` : '<p class="mut">Add a store first.</p>'}</div>
  <div class="card"><h3 style="margin-bottom:8px">Payments</h3>${evs.map(e => `<div class="line"><span class="n">${esc(e.title)}</span><button data-orders="${e.id}">View orders</button></div><div id="p${e.id}"></div>`).join('') || '<p class="mut">No events yet.</p>'}</div>`;

  $('#ns').onsubmit = act(async e => { await api('/stores', 'POST', fd(e.target)); await adminView(app); });
  const ne = $('#ne');
  if (ne) ne.onsubmit = act(async e => {
    const f = e.target, b = fd(f);
    b.shopper_ids = [...f.shopper_ids.selectedOptions].map(o => +o.value);
    b.open_at = new Date(b.open_at).toISOString();
    b.close_at = new Date(b.close_at).toISOString();
    await api('/events', 'POST', b);
    go('events');
  });
  app.querySelectorAll('[data-orders]').forEach(b => b.onclick = () => showOrders(+b.dataset.orders));
}

async function showOrders(eventId) {
  const orders = await api(`/events/${eventId}/orders`);
  const box = $('#p' + eventId);
  box.innerHTML = orders.map(o => `<label class="line" style="font-weight:400;font-size:1rem"><input type="checkbox" data-paid="${o.id}" ${o.paid ? 'checked' : ''}><span class="n">${esc(o.buyer)}${o.org ? ' · ' + esc(o.org) : ''}</span><span class="price">${usd(o.total)}</span></label>`).join('') || '<p class="mut">No orders.</p>';
  box.querySelectorAll('[data-paid]').forEach(c => c.onchange = () => api(`/orders/${c.dataset.paid}/paid`, 'POST', { paid: c.checked }));
}
