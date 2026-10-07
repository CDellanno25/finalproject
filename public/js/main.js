import { api } from './api.js';
import { state, go } from './state.js';
import { $ } from './util.js';
import { loginView } from './views/login.js';
import { eventsView } from './views/events.js';
import { orderView } from './views/order.js';
import { shopView } from './views/shop.js';
import { boardView } from './views/board.js';
import { adminView } from './views/admin.js';

const app = $('#app');
const views = { events: eventsView, order: orderView, shop: shopView, board: boardView, admin: adminView };

function render() {
  if (!state.me) return loginView(app);

  const tabs = [['events', 'Events'], ['board', 'Leaderboard'], ...(state.me.role === 'admin' ? [['admin', 'Admin']] : [])];

  $('#nav').innerHTML = tabs.map(([v, l]) => `<button data-tab="${v}" class="${state.view === v || (v === 'events' && ['order', 'shop'].includes(state.view)) ? 'on' : ''}">${l}</button>`).join('');
  $('#nav').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  $('#who').innerHTML = `${state.me.name} <button id="out">Sign out</button>`;
  $('#out').onclick = async () => { await api('/logout', 'POST'); state.me = null; render(); };
  
  views[state.view](app);
}

state.render = render;
state.me = await api('/me');
render();
