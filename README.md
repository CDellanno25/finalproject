# Shopping Runs
**Live app:** (https://finalproject-8orx.onrender.com/)
**Video (under 5 min):** https://drive.google.com/file/d/1UoQiLvTchQV2LOuM0BrXYIop_GbnqJso/view?usp=sharing

**Team:** Christian Dell'Anno, Raghavan Rajkumar, Owen Nguyen

## What it is
Shopping Runs is a club item order app. An admin creates a shopping event (for example "9/22 Target Run") with a store, an open and close time, a Venmo handle, a flat fee, and one or more shoppers. While the event is open, any signed-in buyer can add items to their order (name, price, quantity, location in store, and their club). When the event closes, orders lock and the assigned shoppers get a shopping list grouped by location in the store, which they check off as they pick items up.

Each buyer sees their total with sales tax and the flat fee, plus a Venmo QR code and link to pay the admin. Each event shows a map of the store, your distance, and a route. Admins can add and delete stores, create and delete events, and mark orders as paid. A leaderboard ranks the most items bought, the most money spent, and the most items picked up.

## How to use it
- Sign in with any Google account.
- Admins are the emails listed in the server's `ADMIN_EMAILS` setting. GRADER NOTE: If you want to be an admin, email us your gmail.
- Everyone else is a buyer.
- A buyer (or admin) becomes a shopper for an event when an admin assigns them to it.
- FULL FLOW: As admin, add a store (Admin tab) and create an event that is open now. As a buyer, add items from the Events tab. Once the event closes, the assigned shopper opens "Shopping list" and marks items off as bought. Back in the Admin tab, mark an order as paid.

## Technologies
- **Static content and design:** HTML and CSS (no framework). It is responsive for different types of devices.
- **Client-side JavaScript:** A single-page app using ES modules, with one module per view (events, order, shopping list, leaderboard, admin).
- **Server (Node.js):** Express 5 with `express-session` for sessions, and the MongoDB driver for data.
- **Database:** MongoDB Atlas, with collections for users, stores, events, orders, items and event shoppers.
- **Authentication:** Google Sign-In with OAuth. The server verifies the Google ID token with `google-auth-library` and keys users by Google account id.
- **Maps:** `Leaflet` with `OpenStreetMap` tiles. Addresses are looked up with `Nominatim`, routes come from `OSRM`, and the server throttles and caches both. There is also a "Directions in `Google Maps`" link on each event.
- **Payments:** the `qrcode` package generates a Venmo QR code for each order total.
- **Hosting:** `Render`.

## Challenges
- **Google Maps to OpenStreetMap.** We planned to use the Google Maps API, but it needs a billing account. We switched to Leaflet, Nominatim and OSRM. Nominatim and OSRM allow only about one request per second, so the server throttles and caches lookups. If routing fails, the app falls back to a straight-line distance. Our Admin page also shows the matched address before a store is saved, so a wrong geocode is caught.
- **Secure sign-in.** The server must verify Google's signed token, so users are keyed by Google account id instead of email, and the admin role comes from server configuration (in .env file).
- **Failure handling.** The app still works if the map library fails to load or the routing service is down, along with other cases like how a double click can't submit twice.

## Who did what
- **Owen Nguyen:** Google login w/ OAuth, map and routing features, admin store/event deletion, money-spent leaderboard, testing and bug fixes, server, README
- **Christian Dell'Anno:** Initial app creation (design and layout), items leaderboard, initial admin page, server
- **Raghavan Rajkumar:** Initial events page, admin page revamp, database creation and integration, server

## Running it locally
1. Run `npm install`.
2. Create a `.env` file with `MONGODB_URI`, `MONGODB_DB`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET` and `ADMIN_EMAILS` (comma-separated).
3. Run `npm start`, then open `http://localhost:3000` (or the port set in `PORT`).

For local testing without Google, remove `GOOGLE_CLIENT_ID` and set `DEV_LOGIN=true` to sign in as any email. Never set `DEV_LOGIN` in production.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Geocoding follows the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
