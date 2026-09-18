Team Members: Christian Dell’Anno, Raghavan Rajkumar, Owen Nguyen
Key Technologies / Libraries: OAuth, JavaScript, Node.js, MongoDB, React, Next.js, Google Maps API
Description:
Club Item Order Application

Our final project is an application where users (Buyers) can place orders for items (e.g. Basketball, Pizza, Jersey Mike’s, Soda) for their club/organization for certain shopping events (e.g. 9/22 Target Run). Another type of user (Shopper) will then be able to view orders and check off items on the list when they pick them up. Admins can create these shopping events that open to buyers at a certain date, and close at a later date. A shopping event will have a store, open date/time, close date/time, and shopper(s). Buyers can add items (name, price, location in store) from that specific store between that window. Once that window closes, buyers can’t add any more orders, and shoppers will have access to the placed orders.

When Buyers are checking out they will be prompted to a screen to Venmo the Admin, which will be updated with a QR Code which leads to the Venmo. The price of the purchase will be calculated including any tax/fees. Buyers will be able to see how far away each store is using the Google Maps API. Users sign in using OAuth authentication through Google. A leaderboard will be integrated to show which Buyers have bought the most items and which Shoppers have picked up the most orders.
