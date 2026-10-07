require('dotenv').config();
const express = require('express'), session = require('express-session');
const { DatabaseSync } = require('node:sqlite'), QRCode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');

const db = new DatabaseSync(process.env.DB_PATH || 'app.db');

db.exec('pragma foreign_keys = on');

db.exec(`create table if not exists users(id integer primary key, google_sub text unique, email text, name text, role text default 'buyer');
create table if not exists stores(id integer primary key, name text, address text, lat real, lng real, tax_rate real default 0);
create table if not exists events(id integer primary key, store_id integer references stores(id), title text, open_at text, close_at text, venmo_handle text, fee real default 0);
create table if not exists event_shoppers(event_id integer references events(id), user_id integer references users(id), primary key(event_id, user_id));
create table if not exists orders(id integer primary key, event_id integer references events(id), buyer_id integer references users(id), org text, paid integer default 0, unique(event_id, buyer_id));
create table if not exists items(id integer primary key, order_id integer references orders(id) on delete cascade, name text, price real, location text, qty integer default 1, picked_by integer references users(id), picked_at text);`);

const CID = process.env.GOOGLE_CLIENT_ID, oauth = CID && new OAuth2Client(CID);
const nul = p => p.map(v => v === undefined ? null : v);
const get = (s, ...p) => db.prepare(s).get(...nul(p)), all = (s, ...p) => db.prepare(s).all(...nul(p)), run = (s, ...p) => db.prepare(s).run(...nul(p));
const money = n => Math.round(n * 100) / 100;
const status = e => { const n = Date.now(); return n < Date.parse(e.open_at) ? 'upcoming' : n < Date.parse(e.close_at) ? 'open' : 'closed'; };
const me = req => get('select * from users where id=?', req.session.uid);
const need = (req, res, next) => req.session.uid ? next() : res.status(401).json({ error: 'Sign in first.' });
const admin = (req, res, next) => me(req).role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });
const fail = (res, code, error) => res.status(code).json({ error });

const app = express();
app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret', resave: false, saveUninitialized: false, cookie: { sameSite: 'lax' } }));
app.use(express.static('public'));

function login(req, sub, email, name) {
  let u = get('select * from users where google_sub=?', sub);

  if (!u) 
  {
    const adminList = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim());
    const isAdmin = !get('select 1 x from users') || adminList.includes(email.toLowerCase());
    const r = run('insert into users(google_sub,email,name,role) values(?,?,?,?)', sub, email, name, isAdmin ? 'admin' : 'buyer');
    u = get('select * from users where id=?', r.lastInsertRowid);
  }

  req.session.uid = u.id;
  return u;
}

app.get('/api/config', (req, res) => res.json({ googleClientId: CID || null }));

app.post('/api/auth/google', async (req, res) => {
  try {
    const t = await oauth.verifyIdToken({ idToken: req.body.credential, audience: CID });
    const p = t.getPayload();

    res.json(login(req, p.sub, p.email, p.name || p.email));
  } catch { 
      fail(res, 401, 'Google sign-in failed.'); 
  }
});

app.post('/api/auth/dev', (req, res) => {
  if (CID) 
    return fail(res, 403, 'Dev login is off.');

  const { email, name } = req.body;

  if (!email) 
    return fail(res, 400, 'Enter an email.');

  res.json(login(req, 'dev:' + email, email, name || email));
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', (req, res) => res.json(req.session.uid ? me(req) : null));

app.get('/api/stores', need, (req, res) => res.json(all('select * from stores order by name')));

app.post('/api/stores', need, admin, (req, res) => {
  const { name, address, lat, lng, tax_rate } = req.body;

  if (!name) 
    return fail(res, 400, 'Store name is required.');

  run('insert into stores(name,address,lat,lng,tax_rate) values(?,?,?,?,?)', name, address, lat || null, lng || null, (tax_rate || 0) / 100);

  res.json({ ok: true });
});

app.get('/api/users', need, admin, (req, res) => res.json(all('select id,name,email,role from users order by name')));

const eventRow = id => get('select e.*, s.name store_name, s.address, s.tax_rate from events e join stores s on s.id=e.store_id where e.id=?', id);
const isShopper = (eid, uid) => !!get('select 1 x from event_shoppers where event_id=? and user_id=?', eid, uid);

app.get('/api/events', need, (req, res) => {
  const rows = all('select e.*, s.name store_name, s.address, s.lat, s.lng from events e join stores s on s.id=e.store_id order by e.open_at desc');

  res.json(rows.map(e => ({ ...e, status: status(e), isShopper: isShopper(e.id, req.session.uid),
    shoppers: all('select u.name from event_shoppers x join users u on u.id=x.user_id where x.event_id=?', e.id).map(s => s.name) })));
});

app.post('/api/events', need, admin, (req, res) => {
  const { store_id, title, open_at, close_at, venmo_handle, fee, shopper_ids = [] } = req.body;

  if (!store_id || !title || !open_at || !close_at || !venmo_handle) 
    return fail(res, 400, 'Fill in every field.');

  if (Date.parse(close_at) <= Date.parse(open_at)) 
    return fail(res, 400, 'Close time must be after open time.');

  const id = run('insert into events(store_id,title,open_at,close_at,venmo_handle,fee) values(?,?,?,?,?,?)',
    store_id, title, open_at, close_at, venmo_handle.replace(/^@/, ''), fee || 0).lastInsertRowid;
  shopper_ids.forEach(u => run('insert or ignore into event_shoppers values(?,?)', id, u));

  res.json({ id });
});

function totals(order, e) {
  const items = order ? all('select * from items where order_id=? order by id', order.id) : [];
  const sub = items.reduce((s, i) => s + i.price * i.qty, 0), tax = sub * e.tax_rate, fee = items.length ? e.fee : 0;

  return { items, subtotal: money(sub), tax: money(tax), fee: money(fee), total: money(sub + tax + fee) };
}

app.get('/api/events/:id/order', need, async (req, res) => {
  const e = eventRow(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  const o = get('select * from orders where event_id=? and buyer_id=?', e.id, req.session.uid);
  const t = totals(o, e);
  const note = encodeURIComponent(`${e.title} order`);
  const venmoLink = `https://venmo.com/${e.venmo_handle}?txn=pay&amount=${t.total}&note=${note}`;

  res.json({ ...t, org: o?.org || '', paid: !!o?.paid, status: status(e), venmo: e.venmo_handle, venmoLink, qr: t.items.length ? await QRCode.toDataURL(venmoLink, { margin: 1, width: 240 }) : null });
});

app.post('/api/events/:id/items', need, (req, res) => {
  const e = eventRow(req.params.id); if (!e) return fail(res, 404, 'Event not found.');

  if (status(e) !== 'open') 
    return fail(res, 403, 'This event is not open for orders.');

  const { name, price, location, qty, org } = req.body;
  if (!name || !(price > 0)) 
    return fail(res, 400, 'Enter an item name and a price above 0.');

  run('insert or ignore into orders(event_id,buyer_id) values(?,?)', e.id, req.session.uid);

  const o = get('select * from orders where event_id=? and buyer_id=?', e.id, req.session.uid);
  if (org) 
    run('update orders set org=? where id=?', org, o.id);

  run('insert into items(order_id,name,price,location,qty) values(?,?,?,?,?)', o.id, name, price, location || '', Math.max(1, parseInt(qty) || 1));
  res.json({ ok: true });
});

app.delete('/api/items/:id', need, (req, res) => {
  const i = get('select i.id, o.event_id from items i join orders o on o.id=i.order_id where i.id=? and o.buyer_id=?', req.params.id, req.session.uid);
  
  if (!i) 
    return fail(res, 404, 'Item not found.');
  
  if (status(eventRow(i.event_id)) !== 'open') 
    return fail(res, 403, 'Orders are locked.');
  
  run('delete from items where id=?', i.id); res.json({ ok: true });
});

app.get('/api/events/:id/shop', need, (req, res) => {
  const e = eventRow(req.params.id); 
  if (!e) 
    return fail(res, 404, 'Event not found.');

  if (!isShopper(e.id, req.session.uid) && me(req).role !== 'admin') 
    return fail(res, 403, 'You are not a shopper for this event.');

  if (status(e) !== 'closed') 
    return fail(res, 403, 'Orders unlock when the event closes.');

  res.json(all(`select i.*, u.name buyer, o.org from items i join orders o on o.id=i.order_id join users u on u.id=o.buyer_id where o.event_id=? order by i.location, i.name`, e.id));
});

app.post('/api/items/:id/pick', need, (req, res) => {
  const i = get('select i.id, o.event_id from items i join orders o on o.id=i.order_id where i.id=?', req.params.id);
  if (!i) 
    return fail(res, 404, 'Item not found.');

  if (!isShopper(i.event_id, req.session.uid)) 
    return fail(res, 403, 'You are not a shopper for this event.');

  if (status(eventRow(i.event_id)) !== 'closed') 
    return fail(res, 403, 'Orders unlock when the event closes.');

  const r = req.body.picked
    ? run('update items set picked_by=?, picked_at=? where id=? and picked_by is null', req.session.uid, new Date().toISOString(), i.id)
    : run('update items set picked_by=null, picked_at=null where id=? and picked_by=?', i.id, req.session.uid);
  res.json({ ok: r.changes > 0 });
});

app.get('/api/events/:id/orders', need, admin, (req, res) => {
  const e = eventRow(req.params.id);

  res.json(all('select o.*, u.name buyer from orders o join users u on u.id=o.buyer_id where o.event_id=?', e.id)
    .map(o => ({ ...o, total: totals(o, e).total })));
});

app.post('/api/orders/:id/paid', need, admin, (req, res) => { run('update orders set paid=? where id=?', req.body.paid ? 1 : 0, req.params.id); res.json({ ok: true }); });

app.get('/api/leaderboard', need, (req, res) => res.json({
  buyers: all('select u.name, sum(i.qty) n from items i join orders o on o.id=i.order_id join users u on u.id=o.buyer_id group by u.id order by n desc limit 10'),
  shoppers: all('select u.name, count(*) n from items i join users u on u.id=i.picked_by group by u.id order by n desc limit 10'),
}));

app.get('/api/stores/:id/distance', need, async (req, res) => {
  const s = get('select * from stores where id=?', req.params.id), { lat, lng } = req.query;
  if (!s || !s.lat || !lat) 
    return fail(res, 400, 'Missing coordinates.');

  const key = process.env.MAPS_API_KEY;
  if (key) {
    const u = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${lat},${lng}&destinations=${s.lat},${s.lng}&key=${key}`;
    const el = (await (await fetch(u)).json()).rows?.[0]?.elements?.[0];

    if (el?.status === 'OK') 
      return res.json({ text: `${el.distance.text} · ${el.duration.text} drive` });
  }
  const R = 3958.8, r = x => x * Math.PI / 180, dLat = r(s.lat - lat), dLng = r(s.lng - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(s.lat)) * Math.sin(dLng / 2) ** 2;
  
  res.json({ text: `${(2 * R * Math.asin(Math.sqrt(a))).toFixed(1)} mi (straight line)` });
});

app.listen(process.env.PORT || 3000, () => console.log('Shopping Runs on http://localhost:' + (process.env.PORT || 3000)));
