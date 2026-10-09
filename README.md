# Shopping Runs

**Live app:** [PASTE RENDER URL HERE]
**Video (under 5 min):** [PASTE VIDEO LINK HERE]

**Team:** Christian Dell'Anno, Raghavan Rajkumar, Owen Nguyen

## What it is

Shopping Runs is a club item order app. An admin creates a shopping event (for example "9/22 Target Run") with a store, an open and close time, a Venmo handle, a flat fee, and one or more shoppers. While the event is open, any signed-in buyer can add items to their order (name, price, quantity, location in store, and their club). When the event closes, orders lock and the assigned shoppers get a shopping list grouped by location in the store, which they check off as they pick items up.

Each buyer sees their total with sales tax and the flat fee, plus a Venmo QR code and link to pay the admin. Each event shows a map of the store, your distance, and a route. Admins can add and delete stores, create and delete events, and mark orders as paid. A leaderboard ranks the most items bought, the most money spent, and the most items picked up.

## How to use it

- Sign in with any Google account. No separate registration is needed.
- Admins are the emails listed in the server's `ADMIN_EMAILS` setting. Admin account for grading: [FILL IN EMAIL]
- Everyone else is a buyer. A buyer becomes a shopper for an event when an admin assigns them to it.
- To try the full flow: as admin, add a store (Admin tab) and create an event that is open now. As a buyer, add items from the Events tab. Once the event closes, the assigned shopper opens "Shopping list". Back in the Admin tab, mark an order as paid.

## Technologies

- **Static content and design:** semantic HTML and hand-written CSS with no framework. It is responsive down to 320px wide, uses labelled landmarks and visible keyboard focus, and escapes all user text.
- **Client-side JavaScript:** a single-page app using ES modules, with one module per view (events, order, shopping list, leaderboard, admin). There is no framework or build step.
- **Server (Node.js):** Express 5 with `express-session` for sessions, and the MongoDB driver for data.
- **Database:** MongoDB Atlas, with collections for users, stores, events, orders, items and event shoppers.
- **Authentication:** Google Sign-In. The server verifies the Google ID token with `google-auth-library` (including the audience) and keys users by Google account id.
- **Maps:** `Leaflet` with `OpenStreetMap` tiles. Addresses are looked up with `Nominatim`, routes come from `OSRM`, and the server throttles and caches both. There is also a "Directions in `Google Maps`" link on each event.
- **Payments:** the `qrcode` package generates a Venmo QR code for each order total.
- **Hosting:** `Render`.

## Challenges

- **Google Maps to OpenStreetMap.** We planned to use the Google Maps API, but it needs a billing account. We switched to Leaflet, Nominatim and OSRM. Nominatim and OSRM allow only about one request per second, so the server throttles and caches lookups. If routing fails, the app falls back to a straight-line distance. Our Admin page also shows the matched address before a store is saved, so a wrong geocode is caught.
- **Secure sign-in.** The server must verify Google's signed token rather than trust the browser, so users are keyed by Google account id instead of email, and the admin role comes from server configuration.
- **Money correctness.** Tax, the flat fee (charged once per order) and rounding must match everywhere. The order page, Venmo amount, admin payments panel and leaderboard all use the same calculation.
- **Failure handling.** The app still works if the map library fails to load or the routing service is down. A double-click can't submit twice, and a failed save reverts the checkbox and shows a message. We tested this against a real database and browser, including phone widths and accessibility checks.

## Who did what

- **Owen Nguyen:** [FILL IN. For example: Google login, map and routing features, admin store/event deletion, money-spent leaderboard, testing and bug fixes, README]
- **Christian Dell'Anno:** [FILL IN]
- **Raghavan Rajkumar:** [FILL IN]

## Running it locally

1. Run `npm install`.
2. Create a `.env` file with `MONGODB_URI`, `MONGODB_DB`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET` and `ADMIN_EMAILS` (comma-separated).
3. Run `npm start`, then open `http://localhost:3000` (or the port set in `PORT`).

For local testing without Google, remove `GOOGLE_CLIENT_ID` and set `DEV_LOGIN=true` to sign in as any email. Never set `DEV_LOGIN` in production.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Geocoding follows the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
