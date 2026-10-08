import { api } from '../api.js';
import { go } from '../state.js';
import { $, act, esc, fd, usd } from '../util.js';

export async function adminView(app) {
  const [stores, users, evs] = await Promise.all([api('/stores'), api('/users'), api('/events')]);

  app.innerHTML = `
    <h2 style="margin-bottom:16px">Admin</h2>
    <p class="err" id="msg"></p>

    <div class="card">
      <h3 style="margin-bottom:10px">Add a store</h3>
      <form id="ns">
        <label>Name<input name="name" required></label>
        <label>Address<input name="address" required placeholder="529 Lincoln St, Worcester, MA"></label>
        <label>Sales tax %<input name="tax_rate" type="number" step="0.01" value="0"></label>
        <button>Find address</button>
      </form>
      <div id="preview" hidden>
        <p style="margin:12px 0 2px">Found: <strong id="pv-addr"></strong></p>
        <p class="mut" id="pv-full" style="margin:0 0 6px"></p>
        <p class="err" id="pv-warn" hidden>This match is approximate. Add a street number or city if it's the wrong place.</p>
        <div class="row">
          <a class="btn" id="pv-map" target="_blank" rel="noopener">View on map</a>
          <button type="button" class="pri" id="pv-save">Save store</button>
        </div>
      </div>
      <p class="mut" id="ok" role="status"></p>
      <p class="mut">Addresses are located with <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> data © OpenStreetMap contributors.</p>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">Stores</h3>
      ${stores.map(s => {
        const used = evs.filter(e => e.store_id === s.id).length;

        return `
        <div class="line">
          <span class="n"><strong>${esc(s.name)}</strong><br><span class="mut">${esc(s.address || 'No address')}</span></span>
          ${used ? `<span class="mut">Used by ${used} event${used === 1 ? '' : 's'}</span>` : `<button data-del-store="${s.id}">Delete</button>`}
        </div>`;
      }).join('') || '<p class="mut">No stores yet.</p>'}
      <p class="mut" id="stores-msg" role="status"></p>
    </div>

    <div class="card">
      <h3 style="margin-bottom:10px">Create a shopping event</h3>
      ${stores.length ? `
        <form id="ne" class="wide">
          <label>Title<input name="title" required placeholder="9/22 Target Run"></label>
          <label>Store<select name="store_id">${stores.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
          <label>Opens<input name="open_at" type="datetime-local" required></label>
          <label>Closes<input name="close_at" type="datetime-local" required></label>
          <label>Your Venmo handle<input name="venmo_handle" required placeholder="@yourname"></label>
          <label>Flat fee ($)<input name="fee" type="number" step="0.01" value="0"></label>
          <label>Shoppers<select name="shopper_ids" multiple size="4">${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
          <button class="pri">Create event</button>
        </form>` : '<p class="mut">Add a store first.</p>'}
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">Events and payments</h3>
      ${evs.map(e => `
        <div class="line"><span class="n">${esc(e.title)}</span><button data-orders="${e.id}" aria-expanded="false" aria-controls="p${e.id}">View orders</button><button data-del-event="${e.id}">Delete</button></div>
        <div id="p${e.id}" hidden></div>`).join('') || '<p class="mut">No events yet.</p>'}
      <p class="mut" id="events-msg" role="status"></p>
    </div>`;

  wireStoreForm(app);

  const ne = $('#ne');

  if (ne) ne.onsubmit = act(async e => {
    const f = e.target, b = fd(f);

    b.shopper_ids = [...f.shopper_ids.selectedOptions].map(o => +o.value);
    b.open_at = new Date(b.open_at).toISOString();
    b.close_at = new Date(b.close_at).toISOString();

    await api('/events', 'POST', b);
    go('events');
  });

  app.querySelectorAll('[data-orders]').forEach(b => b.onclick = act(() => toggleOrders(b)));

  app.querySelectorAll('[data-del-store]').forEach(b => b.onclick = act(async () => {
    const store = stores.find(s => s.id === +b.dataset.delStore);

    if (!confirm(`Delete ${store.name}? This can't be undone.`)) return;

    b.disabled = true;

    try {
      await api(`/stores/${store.id}`, 'DELETE');
    } finally {
      b.disabled = false;
    }

    await adminView(app);
    $('#stores-msg').textContent = `Deleted ${store.name}.`;
  }));

  app.querySelectorAll('[data-del-event]').forEach(b => b.onclick = act(async () => {
    const event = evs.find(e => e.id === +b.dataset.delEvent);

    b.disabled = true;

    try {
      const orders = await api(`/events/${event.id}/orders`);

      if (!confirm(deleteEventMessage(event, orders))) return;

      const result = await api(`/events/${event.id}`, 'DELETE');

      await adminView(app);
      $('#events-msg').textContent = `Deleted "${event.title}"` +
        (result.orders ? ` and ${result.orders} order${result.orders === 1 ? '' : 's'}.` : '.');
    } finally {
      b.disabled = false;
    }
  }));
}

function deleteEventMessage(event, orders) {
  if (!orders.length) {
    return `Delete "${event.title}"? This can't be undone.`;
  }

  const paid = orders.filter(o => o.paid);
  const collected = paid.reduce((sum, o) => sum + o.total, 0);

  return [
    `Delete "${event.title}"?`,
    '',
    `This will also permanently delete ${orders.length} order${orders.length === 1 ? '' : 's'} and every item in them` +
      (paid.length ? `, including ${paid.length} marked paid (${usd(collected)}).` : '.'),
    'Leaderboard totals will go down.',
    '',
    "This can't be undone.",
  ].join('\n');
}

function wireStoreForm(app) {
  const form = $('#ns');
  const preview = $('#preview');
  const findButton = form.querySelector('button');
  const saveButton = $('#pv-save');
  const addressInput = form.elements.address;

  addressInput.oninput = () => { preview.hidden = true; };

  form.onsubmit = act(async () => {
    const address = addressInput.value;

    preview.hidden = true;
    findButton.disabled = true;
    findButton.textContent = 'Finding…';

    try {
      const place = await api('/geocode', 'POST', { address });

      if (addressInput.value !== address) return;

      $('#pv-addr').textContent = place.formatted;
      $('#pv-full').textContent = place.matched;
      $('#pv-warn').hidden = place.precise;
      $('#pv-map').href = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=18/${place.lat}/${place.lng}`;
      preview.hidden = false;
    } finally {
      findButton.disabled = false;
      findButton.textContent = 'Find address';
    }
  });

  saveButton.onclick = act(async () => {
    if (!form.reportValidity()) return;

    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';

    try {
      const saved = await api('/stores', 'POST', fd(form));

      await adminView(app);
      $('#ok').textContent = `Saved. Located at: ${saved.address}`;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save store';
    }
  });
}

async function toggleOrders(button) {
  const box = $('#p' + button.dataset.orders);

  if (button.getAttribute('aria-expanded') === 'true') {
    box.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'View orders';
    return;
  }

  button.disabled = true;

  try {
    await showOrders(+button.dataset.orders);
  } finally {
    button.disabled = false;
  }

  box.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  button.textContent = 'Hide orders';
}

async function showOrders(eventId) {
  const orders = await api(`/events/${eventId}/orders`);
  const box = $('#p' + eventId);

  box.innerHTML = orders.map(o => `<label class="line" style="font-weight:400;font-size:1rem"><input type="checkbox" data-paid="${o.id}" ${o.paid ? 'checked' : ''}><span class="n">${esc(o.buyer)}${o.org ? ' · ' + esc(o.org) : ''}</span><span class="price">${usd(o.total)}</span></label>`).join('') || '<p class="mut">No orders.</p>';
  box.querySelectorAll('[data-paid]').forEach(c => c.onchange = () => api(`/orders/${c.dataset.paid}/paid`, 'POST', { paid: c.checked }));
}