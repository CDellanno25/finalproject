import { api } from '../api.js';
import { esc } from '../util.js';

const table = (title, rows) => `<div class="card"><h3 style="margin-bottom:8px">${title}</h3><table>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="price">${r.n}</td></tr>`).join('') || '<tr><td class="mut">No results yet.</td></tr>'}</table></div>`;

export async function boardView(app) {
  const b = await api('/leaderboard');
  app.innerHTML = `<h2 style="margin-bottom:16px">Leaderboard</h2>${table('Most items bought', b.buyers)}${table('Most items picked up', b.shoppers)}`;
}
