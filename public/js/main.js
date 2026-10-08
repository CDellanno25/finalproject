import { api } from './api.js';
import { state, go, wireNav } from './state.js';
import { $, esc, say } from './util.js';
import { loginView } from './views/login.js';
import { eventsView } from './views/events.js';
import { orderView } from './views/order.js';
import { shopView } from './views/shop.js';
import { boardView } from './views/board.js';
import { adminView } from './views/admin.js';

const app = $('#app');
const views = { events: eventsView, order: orderView, shop: shopView, board: boardView, admin: adminView };

function render() {
  if (!state.me) return loginView(app).catch(showViewError);

  const tabs = [['events', 'Events'], ['board', 'Leaderboard'], ...(state.me.role === 'admin' ? [['admin', 'Admin']] : [])];

  $('#nav').innerHTML = tabs.map(([v, l]) => `<button data-tab="${v}" class="${state.view === v || (v === 'events' && ['order', 'shop'].includes(state.view)) ? 'on' : ''}">${l}</button>`).join('');
  $('#nav').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  $('#who').innerHTML = `<span class="user-chip" title="${esc(state.me.email)}"><span class="avatar" aria-hidden="true">${esc(initials(state.me))}</span><span class="user-name">${esc(state.me.name || state.me.email)}</span></span><button id="out">Sign out</button>`;
  $('#out').onclick = async () => { await api('/logout', 'POST'); state.me = null; state.view = 'events'; render(); };

  return views[state.view](app).catch(showViewError);
}

async function showViewError(x) {
  if (x.status === 401) {
    state.me = null;
    state.view = 'events';
    await render();
    say('Your session ended. Please sign in again.');
    return;
  }

  app.innerHTML = `<div class="card"><h2>Couldn't load this page</h2><p class="err">${esc(x.message)}</p><button data-go="events">← Events</button></div>`;
  wireNav(app);
}

function initials({ name, email }) {
  const firsts = (name || email || '')
    .split(/\s+/)
    .map(word => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter(Boolean);

  const letters = firsts.length > 1 ? [firsts[0], firsts.at(-1)] : firsts;

  return (letters.join('') || '?').toUpperCase();
}

state.render = render;
state.me = await api('/me').catch(() => null);
render();