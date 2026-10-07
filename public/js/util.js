export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = n => '$' + Number(n).toFixed(2);
export const fmt = d => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fd = f => Object.fromEntries(new FormData(f));
export const say = m => { const e = $('#msg'); if (e) e.textContent = m || ''; };
// Wrap a form handler: stop the page reload and show any error in #msg.
export const act = fn => async e => { e.preventDefault(); try { say(''); await fn(e); } catch (x) { say(x.message); } };
