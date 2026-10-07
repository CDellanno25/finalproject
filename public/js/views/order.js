import { api } from '../api.js';
import { state, wireNav } from '../state.js';
import { $, act, esc, fd, fmt, say, usd } from '../util.js';

export async function orderView(app) {
  const id = state.eid;
  const [evs, o] = await Promise.all([api('/events'), api(`/events/${id}/order`)]);
  const e = evs.find(x => x.id === id);
  app.innerHTML = `<button data-go="events">← Events</button>
  <h2 style="margin:14px 0 4px">${esc(e.title)}</h2><p class="mut">${esc(e.store_name)} · <span class="chip ${o.status}">${o.status}</span> ${o.status === 'upcoming' ? 'Opens ' + fmt(e.open_at) : o.status === 'open' ? 'Closes ' + fmt(e.close_at) : 'Orders are locked'}</p><p class="err" id="msg"></p>
  ${o.status === 'open' ? `<div class="card"><form id="add"><label>Item<input name="name" required placeholder="Pizza"></label><label>Price<input name="price" type="number" step="0.01" min="0.01" required></label>
  <label>Location in store<input name="location" placeholder="Aisle 12"></label><label>Qty<input name="qty" type="number" min="1" value="1"></label><label>Club / organization<input name="org" value="${esc(o.org)}"></label><button class="pri">Add to order</button></form></div>` : ''}
  <div class="card"><h3 style="margin-bottom:8px">Your order</h3>${o.items.map(i => `<div class="line"><span class="n">${esc(i.name)} ×${i.qty}<br><span class="mut">${esc(i.location || 'No location given')}</span></span><span class="price">${usd(i.price * i.qty)}</span>
  ${o.status === 'open' ? `<button data-rm="${i.id}" aria-label="Remove ${esc(i.name)}">Remove</button>` : ''}</div>`).join('') || '<p class="mut">Nothing here yet.</p>'}
  ${o.items.length ? `<div class="line"><span class="n">Subtotal</span><span class="price">${usd(o.subtotal)}</span></div><div class="line"><span class="n">Tax</span><span class="price">${usd(o.tax)}</span></div><div class="line"><span class="n">Fees</span><span class="price">${usd(o.fee)}</span></div>
  <div class="row" style="margin-top:8px"><span class="total">${usd(o.total)}</span>${o.paid ? '<span class="chip open sp">Paid</span>' : `<button class="pri sp" id="checkout">Check out</button>`}</div>` : ''}</div>
  ${o.qr ? `<div class="card receipt" id="pay" hidden><h3>Venmo @${esc(o.venmo)}</h3><p class="mut">Scan to pay ${usd(o.total)}. Add more items later and the QR code will update.</p><img src="${o.qr}" width="240" height="240" alt="Venmo QR code"><p><a href="${esc(o.venmoLink)}" target="_blank" rel="noopener">Open in Venmo</a></p></div>` : ''}`;
  wireNav(app);
  const f = $('#add');
  if (f) f.onsubmit = act(async ev => { await api(`/events/${id}/items`, 'POST', fd(ev.target)); await orderView(app); });
  const co = $('#checkout');
  if (co) co.onclick = () => { $('#pay').hidden = false; co.hidden = true; };
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    try { await api('/items/' + b.dataset.rm, 'DELETE'); await orderView(app); } catch (x) { say(x.message); }
  });
}
