import { api } from '../api.js';
import { state } from '../state.js';
import { $, act, fd, say } from '../util.js';

export async function loginView(app) {
  $('#nav').innerHTML = ''; $('#who').textContent = '';

  const { googleClientId } = await api('/config');

  app.innerHTML = `<div class="card"><h2>Sign in to place or pick up orders</h2><p class="mut">Use your Google account.</p><div id="g"></div><p class="err" id="msg"></p></div>`;
 
  const done = user => { state.me = user; state.render(); };

  if (googleClientId) {
    const s = document.createElement('script');

    s.src = 'https://accounts.google.com/gsi/client';

    s.onload = () => {
      google.accounts.id.initialize({ client_id: googleClientId, callback: async r => {
        try { done(await api('/auth/google', 'POST', { credential: r.credential })); } 
        catch (x) { say(x.message); }
      } });
      google.accounts.id.renderButton($('#g'), { theme: 'outline', size: 'large' });
    };

    document.head.appendChild(s);
  } else {
    $('#g').innerHTML = `<form id="dev"><label>Name<input name="name"></label><label>Email<input name="email" type="email" required></label><button class="pri">Sign in (dev mode)</button></form><p class="mut">Google sign-in is off because GOOGLE_CLIENT_ID isn't set. The first account created becomes the admin.</p>`;
    $('#dev').onsubmit = act(async e => done(await api('/auth/dev', 'POST', fd(e.target))));
  }
}
