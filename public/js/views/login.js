import { api } from '../api.js';
import { state } from '../state.js';
import { $, act, fd, say } from '../util.js';

let gsi = null;

function setupGoogle(clientId) {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => {
      google.accounts.id.initialize({ client_id: clientId, callback: onGoogleCredential });
      resolve();
    };
    s.onerror = () => {
      gsi = null;
      reject(new Error('Could not load Google sign-in. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return gsi;
}

async function onGoogleCredential(r) {
  try {
    state.me = await api('/auth/google', 'POST', { credential: r.credential });
    state.render();
  } catch (x) {
    say(x.message);
  }
}

export async function loginView(app) {
  $('#nav').innerHTML = ''; $('#who').textContent = '';

  const { googleClientId, devLogin } = await api('/config');

  app.innerHTML = `<div class="card"><h2>Sign in to place or pick up orders</h2><p class="mut">Use your Google account.</p><div id="g"></div><p class="err" id="msg"></p></div>`;

  if (googleClientId) {
    try {
      await setupGoogle(googleClientId);
      google.accounts.id.renderButton($('#g'), { theme: 'outline', size: 'large', text: 'signin_with' });
    } catch (x) {
      say(x.message);
    }
  } else if (devLogin) {
    $('#g').innerHTML = `<form id="dev"><label>Name<input name="name"></label><label>Email<input name="email" type="email" required></label><button class="pri">Sign in (dev mode)</button></form><p class="mut">Dev mode is on, so anyone can sign in as any email. Admins are the emails listed in ADMIN_EMAILS.</p>`;
    $('#dev').onsubmit = act(async e => { state.me = await api('/auth/dev', 'POST', fd(e.target)); state.render(); });
  } else {
    $('#g').innerHTML = `<p class="err">Sign-in isn't set up on this server. Set GOOGLE_CLIENT_ID, or DEV_LOGIN=true for local testing.</p>`;
  }
}