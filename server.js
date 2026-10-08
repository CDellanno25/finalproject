require("dotenv").config();

const express = require("express");
const session = require("express-session");
const { MongoClient } = require("mongodb");
const QRCode = require("qrcode");
const { OAuth2Client } = require("google-auth-library");

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let mongoDb;

const CID = process.env.GOOGLE_CLIENT_ID;
const oauth = CID ? new OAuth2Client(CID) : null;

const money = value => Math.round(value * 100) / 100;

function status(event) {
  const now = Date.now();

  if (now < Date.parse(event.open_at)) return "upcoming";
  if (now < Date.parse(event.close_at)) return "open";

  return "closed";
}

const fail = (res, code, error) => res.status(code).json({ error });

async function need(req, res, next) {
  if (!req.session.uid) {
    return fail(res, 401, "Sign in first.");
  }

  const user = await mongoDb.collection("users").findOne({
    id: req.session.uid,
  });

  if (!user) {
    return fail(res, 401, "Sign in again.");
  }

  req.user = user;
  next();
}

function admin(req, res, next) {
  if (req.user?.role !== "admin") {
    return fail(res, 403, "Admins only.");
  }

  next();
}

async function nextId(collectionName) {
  const counter = await mongoDb.collection("counters").findOneAndUpdate(
    { _id: collectionName },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      includeResultMetadata: false,
    }
  );

  return counter.seq;
}

const app = express();

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax" },
  })
);

app.use(express.static("public"));

async function login(req, sub, email, name) {
  const users = mongoDb.collection("users");
  const normalizedEmail = email.trim().toLowerCase();

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  let user = await users.findOne({ google_sub: sub });

  if (!user) {
    const newUser = {
      id: await nextId("users"),
      google_sub: sub,
      email: normalizedEmail,
      name: name || normalizedEmail,
      role: adminEmails.includes(normalizedEmail) ? "admin" : "buyer",
    };

    try {
      await users.insertOne(newUser);
      user = newUser;
    } catch (error) {
      if (error.code !== 11000) throw error;

      user = await users.findOne({ google_sub: sub });

      if (!user) throw error;
    }
  }

  if (adminEmails.includes(normalizedEmail) && user.role !== "admin") {
    await users.updateOne(
      { id: user.id },
      { $set: { role: "admin" } }
    );

    user.role = "admin";
  }

  await new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.uid = user.id;

  return user;
}

async function eventRow(id) {
  const event = await mongoDb.collection("events").findOne({
    id: Number(id),
  });

  if (!event) return null;

  const store = await mongoDb.collection("stores").findOne({
    id: event.store_id,
  });

  if (!store) return null;

  return {
    ...event,
    store_name: store.name,
    address: store.address,
    tax_rate: store.tax_rate,
  };
}

async function isShopper(eventId, userId) {
  return Boolean(
    await mongoDb.collection("event_shoppers").findOne({
      event_id: Number(eventId),
      user_id: Number(userId),
    })
  );
}

async function totals(order, event) {
  const items = order
    ? await mongoDb
        .collection("items")
        .find({ order_id: order.id })
        .sort({ id: 1 })
        .toArray()
    : [];

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const tax = subtotal * event.tax_rate;
  const fee = items.length ? event.fee : 0;

  return {
    items,
    subtotal: money(subtotal),
    tax: money(tax),
    fee: money(fee),
    total: money(subtotal + tax + fee),
  };
}

app.get("/api/config", (req, res) => {
  res.json({ googleClientId: CID || null });
});

app.post("/api/auth/google", async (req, res) => {
  if (!oauth) {
    return fail(res, 400, "Google sign-in is not configured.");
  }

  let payload;

  try {
    const ticket = await oauth.verifyIdToken({
      idToken: req.body.credential,
      audience: CID,
    });

    payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      return fail(res, 401, "Google sign-in failed.");
    }
  } catch {
    return fail(res, 401, "Google sign-in failed.");
  }

  res.json(
    await login(
      req,
      payload.sub,
      payload.email,
      payload.name || payload.email
    )
  );
});

app.post("/api/auth/dev", async (req, res) => {
  if (CID) {
    return fail(res, 403, "Dev login is off.");
  }

  const { email, name } = req.body;

  if (typeof email !== "string" || !email.trim()) {
    return fail(res, 400, "Enter an email.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  res.json(
    await login(
      req,
      "dev:" + normalizedEmail,
      normalizedEmail,
      typeof name === "string" ? name : normalizedEmail
    )
  );
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);

    res.json({ ok: true });
  });
});

app.get("/api/me", async (req, res) => {
  const user = req.session.uid
    ? await mongoDb.collection("users").findOne({
        id: req.session.uid,
      })
    : null;

  res.json(user);
});

app.get("/api/stores", need, async (req, res) => {
  const stores = await mongoDb
    .collection("stores")
    .find({})
    .sort({ name: 1 })
    .toArray();

  res.json(stores);
});

app.post("/api/stores", need, admin, async (req, res) => {
  const { name, address, lat, lng, tax_rate } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    return fail(res, 400, "Store name is required.");
  }

  const latitude = lat === "" || lat == null ? null : Number(lat);
  const longitude = lng === "" || lng == null ? null : Number(lng);
  const taxRate = Number(tax_rate || 0);

  if (
    (latitude !== null &&
      (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
    (longitude !== null &&
      (!Number.isFinite(longitude) || Math.abs(longitude) > 180)) ||
    !Number.isFinite(taxRate) ||
    taxRate < 0
  ) {
    return fail(res, 400, "Enter valid coordinates and a tax rate.");
  }

  await mongoDb.collection("stores").insertOne({
    id: await nextId("stores"),
    name: name.trim(),
    address: typeof address === "string" ? address : "",
    lat: latitude,
    lng: longitude,
    tax_rate: taxRate / 100,
  });

  res.json({ ok: true });
});

app.get("/api/users", need, admin, async (req, res) => {
  const users = await mongoDb
    .collection("users")
    .find(
      {},
      {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          email: 1,
          role: 1,
        },
      }
    )
    .sort({ name: 1 })
    .toArray();

  res.json(users);
});

app.get("/api/events", need, async (req, res) => {
  const events = await mongoDb
    .collection("events")
    .find({})
    .sort({ open_at: -1 })
    .toArray();

  const rows = [];

  for (const event of events) {
    const store = await mongoDb.collection("stores").findOne({
      id: event.store_id,
    });

    if (!store) continue;

    const assignments = await mongoDb
      .collection("event_shoppers")
      .find({ event_id: event.id })
      .toArray();

    const shopperUsers = await mongoDb
      .collection("users")
      .find({
        id: { $in: assignments.map(value => value.user_id) },
      })
      .toArray();

    rows.push({
      ...event,
      store_name: store.name,
      address: store.address,
      lat: store.lat,
      lng: store.lng,
      status: status(event),
      isShopper: assignments.some(
        assignment => assignment.user_id === req.session.uid
      ),
      shoppers: shopperUsers.map(user => user.name),
    });
  }

  res.json(rows);
});

app.post("/api/events", need, admin, async (req, res) => {
  const {
    store_id,
    title,
    open_at,
    close_at,
    venmo_handle,
    fee,
    shopper_ids = [],
  } = req.body;

  const storeId = Number(store_id);
  const openTime = Date.parse(open_at);
  const closeTime = Date.parse(close_at);
  const eventFee = Number(fee || 0);

  if (
    !Number.isSafeInteger(storeId) ||
    storeId < 1 ||
    typeof title !== "string" ||
    !title.trim() ||
    typeof venmo_handle !== "string" ||
    !venmo_handle.replace(/^@/, "").trim() ||
    !Number.isFinite(openTime) ||
    !Number.isFinite(closeTime)
  ) {
    return fail(res, 400, "Fill in every field with valid values.");
  }

  if (closeTime <= openTime) {
    return fail(res, 400, "Close time must be after open time.");
  }

  if (!Number.isFinite(eventFee) || eventFee < 0) {
    return fail(res, 400, "Fee must be zero or greater.");
  }

  if (!Array.isArray(shopper_ids)) {
    return fail(res, 400, "Invalid shopper selection.");
  }

  const shopperIds = [...new Set(shopper_ids.map(Number))];

  for (const userId of shopperIds) {
    if (
      !Number.isSafeInteger(userId) ||
      userId < 1 ||
      !(await mongoDb.collection("users").findOne({ id: userId }))
    ) {
      return fail(res, 400, "Selected shopper does not exist.");
    }
  }

  const store = await mongoDb.collection("stores").findOne({
    id: storeId,
  });

  if (!store) {
    return fail(res, 404, "Store not found.");
  }

  const id = await nextId("events");

  await mongoDb.collection("events").insertOne({
    id,
    store_id: storeId,
    title: title.trim(),
    open_at: new Date(openTime).toISOString(),
    close_at: new Date(closeTime).toISOString(),
    venmo_handle: venmo_handle.replace(/^@/, "").trim(),
    fee: eventFee,
  });

  if (shopperIds.length) {
    await mongoDb.collection("event_shoppers").insertMany(
      shopperIds.map(userId => ({
        event_id: id,
        user_id: userId,
      }))
    );
  }

  res.json({ id });
});

app.get("/api/events/:id/order", need, async (req, res) => {
  const event = await eventRow(req.params.id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  const order = await mongoDb.collection("orders").findOne({
    event_id: event.id,
    buyer_id: req.session.uid,
  });

  const result = await totals(order, event);
  const note = encodeURIComponent(`${event.title} order`);

  const venmoLink =
    `https://venmo.com/${encodeURIComponent(event.venmo_handle)}` +
    `?txn=pay&amount=${result.total}&note=${note}`;

  res.json({
    ...result,
    org: order?.org || "",
    paid: Boolean(order?.paid),
    status: status(event),
    venmo: event.venmo_handle,
    venmoLink,
    qr: result.items.length
      ? await QRCode.toDataURL(venmoLink, {
          margin: 1,
          width: 240,
        })
      : null,
  });
});

app.post("/api/events/:id/items", need, async (req, res) => {
  const event = await eventRow(req.params.id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  if (status(event) !== "open") {
    return fail(res, 403, "This event is not open for orders.");
  }

  const { name, price, location, qty, org } = req.body;
  const itemPrice = Number(price);
  const quantity = Number(qty ?? 1);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    !Number.isFinite(itemPrice) ||
    itemPrice <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    return fail(
      res,
      400,
      "Enter an item name, positive price, and whole quantity above zero."
    );
  }

  const orders = mongoDb.collection("orders");

  const filter = {
    event_id: event.id,
    buyer_id: req.session.uid,
  };

  try {
    await orders.updateOne(
      filter,
      {
        $setOnInsert: {
          id: await nextId("orders"),
          org: "",
          paid: false,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;

    if (!(await orders.findOne(filter))) throw error;
  }

  const order = await orders.findOne(filter);

  if (typeof org === "string") {
    await orders.updateOne(
      { id: order.id },
      { $set: { org: org.trim() } }
    );
  }

  await mongoDb.collection("items").insertOne({
    id: await nextId("items"),
    order_id: order.id,
    name: name.trim(),
    price: itemPrice,
    location: typeof location === "string" ? location : "",
    qty: quantity,
    picked_by: null,
    picked_at: null,
  });

  res.json({ ok: true });
});

app.delete("/api/items/:id", need, async (req, res) => {
  const items = mongoDb.collection("items");

  const item = await items.findOne({
    id: Number(req.params.id),
  });

  if (!item) {
    return fail(res, 404, "Item not found.");
  }

  const order = await mongoDb.collection("orders").findOne({
    id: item.order_id,
    buyer_id: req.session.uid,
  });

  if (!order) {
    return fail(res, 404, "Item not found.");
  }

  const event = await eventRow(order.event_id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  if (status(event) !== "open") {
    return fail(res, 403, "Orders are locked.");
  }

  await items.deleteOne({ id: item.id });

  res.json({ ok: true });
});

app.get("/api/events/:id/shop", need, async (req, res) => {
  const event = await eventRow(req.params.id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  const assigned = await isShopper(event.id, req.session.uid);

  if (!assigned && req.user.role !== "admin") {
    return fail(res, 403, "You are not a shopper for this event.");
  }

  if (status(event) !== "closed") {
    return fail(res, 403, "Orders unlock when the event closes.");
  }

  const orders = await mongoDb
    .collection("orders")
    .find({ event_id: event.id })
    .toArray();

  const orderMap = new Map(
    orders.map(order => [order.id, order])
  );

  const items = await mongoDb
    .collection("items")
    .find({
      order_id: { $in: orders.map(order => order.id) },
    })
    .sort({ location: 1, name: 1 })
    .toArray();

  const results = [];

  for (const item of items) {
    const order = orderMap.get(item.order_id);

    const buyer = await mongoDb.collection("users").findOne({
      id: order.buyer_id,
    });

    results.push({
      ...item,
      buyer: buyer?.name || "Unknown buyer",
      org: order.org || "",
    });
  }

  res.json(results);
});

app.post("/api/items/:id/pick", need, async (req, res) => {
  if (typeof req.body.picked !== "boolean") {
    return fail(res, 400, "Picked must be true or false.");
  }

  const items = mongoDb.collection("items");

  const item = await items.findOne({
    id: Number(req.params.id),
  });

  if (!item) {
    return fail(res, 404, "Item not found.");
  }

  const order = await mongoDb.collection("orders").findOne({
    id: item.order_id,
  });

  if (!order) {
    return fail(res, 404, "Order not found.");
  }

  const event = await eventRow(order.event_id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  if (!(await isShopper(event.id, req.session.uid))) {
    return fail(res, 403, "You are not a shopper for this event.");
  }

  if (status(event) !== "closed") {
    return fail(res, 403, "Orders unlock when the event closes.");
  }

  const result = req.body.picked
    ? await items.updateOne(
        {
          id: item.id,
          picked_by: null,
        },
        {
          $set: {
            picked_by: req.session.uid,
            picked_at: new Date().toISOString(),
          },
        }
      )
    : await items.updateOne(
        {
          id: item.id,
          picked_by: req.session.uid,
        },
        {
          $set: {
            picked_by: null,
            picked_at: null,
          },
        }
      );

  res.json({ ok: result.modifiedCount > 0 });
});

app.get("/api/events/:id/orders", need, admin, async (req, res) => {
  const event = await eventRow(req.params.id);

  if (!event) {
    return fail(res, 404, "Event not found.");
  }

  const orders = await mongoDb
    .collection("orders")
    .find({ event_id: event.id })
    .toArray();

  const results = [];

  for (const order of orders) {
    const buyer = await mongoDb.collection("users").findOne({
      id: order.buyer_id,
    });

    results.push({
      ...order,
      buyer: buyer?.name || "Unknown buyer",
      total: (await totals(order, event)).total,
    });
  }

  res.json(results);
});

app.post("/api/orders/:id/paid", need, admin, async (req, res) => {
  if (typeof req.body.paid !== "boolean") {
    return fail(res, 400, "Paid must be true or false.");
  }

  const result = await mongoDb.collection("orders").updateOne(
    { id: Number(req.params.id) },
    { $set: { paid: req.body.paid } }
  );

  if (result.matchedCount === 0) {
    return fail(res, 404, "Order not found.");
  }

  res.json({ ok: true });
});

app.get("/api/leaderboard", need, async (req, res) => {
  const items = mongoDb.collection("items");

  const buyerTotals = await items
    .aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $group: {
          _id: "$order.buyer_id",
          n: { $sum: "$qty" },
        },
      },
      { $sort: { n: -1, _id: 1 } },
      { $limit: 10 },
    ])
    .toArray();

  const shopperTotals = await items
    .aggregate([
      { $match: { picked_by: { $ne: null } } },
      {
        $group: {
          _id: "$picked_by",
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1, _id: 1 } },
      { $limit: 10 },
    ])
    .toArray();

  async function addNames(rows) {
    return Promise.all(
      rows.map(async row => {
        const user = await mongoDb.collection("users").findOne({
          id: row._id,
        });

        return {
          name: user?.name || "Unknown user",
          n: row.n,
        };
      })
    );
  }

  res.json({
    buyers: await addNames(buyerTotals),
    shoppers: await addNames(shopperTotals),
  });
});

app.get("/api/stores/:id/distance", need, async (req, res) => {
  const store = await mongoDb.collection("stores").findOne({
    id: Number(req.params.id),
  });

  const { lat, lng } = req.query;

  if (
    !store ||
    store.lat == null ||
    store.lng == null ||
    lat == null ||
    lng == null ||
    lat === "" ||
    lng === ""
  ) {
    return fail(res, 400, "Missing coordinates.");
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return fail(res, 400, "Invalid coordinates.");
  }

  const key = process.env.MAPS_API_KEY;

  if (key) {
    try {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/distancematrix/json"
      );

      url.search = new URLSearchParams({
        units: "imperial",
        origins: `${latitude},${longitude}`,
        destinations: `${store.lat},${store.lng}`,
        key,
      }).toString();

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        const element = data.rows?.[0]?.elements?.[0];

        if (element?.status === "OK") {
          return res.json({
            text: `${element.distance.text} · ${element.duration.text} drive`,
          });
        }
      }
    } catch {}
  }

  const radius = 3958.8;
  const radians = value => value * Math.PI / 180;
  const dLat = radians(store.lat - latitude);
  const dLng = radians(store.lng - longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(store.lat)) *
      Math.sin(dLng / 2) ** 2;

  const distance =
    2 * radius * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));

  res.json({
    text: `${distance.toFixed(1)} mi (straight line)`,
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.status === 400) {
    return fail(res, 400, "Invalid request.");
  }

  console.error("Request failed:", error.name);

  fail(res, 500, "Something went wrong. Please try again.");
});

async function startServer() {
  try {
    await mongoClient.connect();

    mongoDb = mongoClient.db(
      process.env.MONGODB_DB || "shopping_runs"
    );

    await mongoDb.command({ ping: 1 });

    for (const collection of [
      "users",
      "stores",
      "events",
      "orders",
      "items",
    ]) {
      await mongoDb.collection(collection).createIndex(
        { id: 1 },
        { unique: true }
      );

      const highest = await mongoDb
        .collection(collection)
        .find({})
        .sort({ id: -1 })
        .limit(1)
        .next();

      await mongoDb.collection("counters").updateOne(
        { _id: collection },
        { $max: { seq: highest?.id || 0 } },
        { upsert: true }
      );
    }

    await mongoDb.collection("users").createIndex(
      { google_sub: 1 },
      { unique: true }
    );

    await mongoDb.collection("orders").createIndex(
      { event_id: 1, buyer_id: 1 },
      { unique: true }
    );

    await mongoDb.collection("event_shoppers").createIndex(
      { event_id: 1, user_id: 1 },
      { unique: true }
    );

    await mongoDb.collection("items").createIndex({
      order_id: 1,
    });

    console.log("Connected to MongoDB.");

    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`Shopping Runs on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    await mongoClient.close();
    process.exitCode = 1;
  }
}

startServer();