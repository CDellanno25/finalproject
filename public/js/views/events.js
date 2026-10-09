import { api } from '../api.js';
import { state, wireNav } from '../state.js';
import { esc, fmt } from '../util.js';

let maps = [];

const hasLocation = e => e.lat != null && e.lng != null;

const mapsReady = () => typeof L !== 'undefined';

const directionsUrl = e =>
  `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=driving`;

export async function eventsView(app) {
  const evs = await api('/events');

  maps.forEach(map => map.remove());
  maps = [];

  app.innerHTML = `<h2 style="margin-bottom:16px">Shopping events</h2><p class="err" id="msg"></p>` + (evs.map(e => `
  <div class="card${e.isShopper ? ' mine' : ''}"><div class="row"><h3>${esc(e.title)}</h3><span class="chip ${e.status}">${e.status}</span>${e.isShopper ? '<span class="chip shopper">You\'re the shopper</span>' : ''}</div>
  <p class="mut" style="margin:6px 0 12px">${esc(e.store_name)} · ${esc(e.address || '')}<br>Orders open ${fmt(e.open_at)}, close ${fmt(e.close_at)}${e.shoppers.length ? '<br>Shopper' + (e.shoppers.length > 1 ? 's' : '') + ': ' + esc(e.shoppers.join(', ')) : ''}</p>
  ${e.isShopper ? `<p class="shopper-note">${e.status === 'closed' ? 'Orders are closed, so your shopping list is ready.' : `Your shopping list unlocks when orders close on ${fmt(e.close_at)}.`}</p>` : ''}
  ${hasLocation(e) ? `
  ${mapsReady() ? `<div class="map" id="m${e.id}" role="region" aria-label="Map for ${esc(e.title)} at ${esc(e.store_name)}"></div>` : ''}
  <p class="mut map-links">${mapsReady() ? `<span id="d${e.id}">Finding your location…</span> · ` : ''}<a href="${directionsUrl(e)}" target="_blank" rel="noopener">Directions in Google Maps</a></p>` : ''}
  <div class="row">${e.status === 'open' ? `<button class="pri" data-go="order" data-id="${e.id}">Add items</button>` : `<button data-go="order" data-id="${e.id}">My order</button>`}
  ${e.status === 'closed' && (e.isShopper || state.me.role === 'admin') ? `<button class="pri" data-go="shop" data-id="${e.id}">Shopping list</button>` : ''}</div></div>`).join('') || '<div class="card">No events yet. An admin can create one.</div>');

  wireNav(app);

  const cards = (mapsReady() ? evs.filter(hasLocation) : []).map(e => ({
    e,
    map: makeMap(e),
    label: document.getElementById('d' + e.id),
  }));

  if (!cards.length) return;

  const here = await currentPosition();

  if (!here) {
    cards.forEach(({ label }) => { label.textContent = 'Allow location access to see the route.'; });
    return;
  }

  const routes = new Map();

  for (const { e } of cards) {
    if (!routes.has(e.store_id)) {
      routes.set(e.store_id, api(`/stores/${e.store_id}/distance?lat=${here.lat}&lng=${here.lng}`));
    }
  }

  await Promise.all(cards.map(async ({ e, map, label }) => {
    let result;

    try {
      result = await routes.get(e.store_id);
    } catch (x) {
      if (label.isConnected) label.textContent = x.message;
      return;
    }

    if (!map.getContainer().isConnected) return;

    label.textContent = result.text;
    drawRoute(map, here, e, result.route);
  }));
}

function makeMap(e) {
  const map = L.map('m' + e.id, { scrollWheelZoom: false }).setView([e.lat, e.lng], 15);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  L.marker([e.lat, e.lng], { title: e.store_name, alt: e.store_name })
    .addTo(map)
    .bindPopup(esc(e.store_name));

  maps.push(map);

  return map;
}

function drawRoute(map, here, e, route) {
  L.circleMarker([here.lat, here.lng], {
    radius: 7,
    weight: 2,
    color: '#14281d',
    fillColor: '#f6d743',
    fillOpacity: 1,
  }).addTo(map).bindTooltip('You are here');

  const line = route
    ? L.polyline(route, { color: '#14281d', weight: 5, opacity: 0.8 })
    : L.polyline([[here.lat, here.lng], [e.lat, e.lng]], { color: '#5b6b60', weight: 3, dashArray: '6 8' });

  line.addTo(map);
  map.fitBounds(line.getBounds(), { paddingTopLeft: [24, 48], paddingBottomRight: [24, 24], maxZoom: 16, animate: false });
}

function currentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);

    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}