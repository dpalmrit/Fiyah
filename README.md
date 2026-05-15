# Project Fiyah — Jigga Jerk Joint Website

Full-featured restaurant website for **Jigga Jerk Joint**. Built as a zero-dependency static site deployed via GitHub Pages, with Firebase as the serverless backend.

---

## Live Site

Deployed automatically to GitHub Pages on every push to `main`.

---

## Pages

| Page | URL | Description |
|---|---|---|
| Landing | `/` | Hero, featured menu, catering CTA, reviews, hours |
| Full Menu | `/menu.html` | All items by category, printable |
| Catering | `/catering.html` | 3-step booking form |
| Order Confirm | `/order-confirm.html` | Post-submit confirmation |
| Admin | `/admin.html` | Full admin portal (auth-gated) |

---

## Admin Portal Features

| Tab | What it does |
|---|---|
| Dashboard | Stats, recent orders, quick actions |
| Menu Editor | Add / edit / delete menu items, toggle active/featured |
| Specials | Enable/disable timed specials banner |
| Catering Orders | View all requests, filter by status, export CSV |
| Square Invoices | Paste Square API token → fetch live invoice list |
| Google My Business | OAuth connect → push hours/description to GMB |
| Settings | Update DoorDash URL, Maps link, phone, address |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Hosting | GitHub Pages (free) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google Sign-In) |
| Storage | Firebase Storage (menu photos) |
| Invoices | Square REST API |
| GMB | Google My Business API |

**Demo mode**: When Firebase is not configured, the site runs on `localStorage` with seed menu data — no backend required to preview.

---

## Firebase Setup (go-live)

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore**, **Authentication** (Google provider), and **Storage**
3. Copy your config object into `js/firebase-init.js` (replace `REPLACE_WITH_*` placeholders)
4. In Firestore, create `settings/site` doc with your DoorDash URL, Maps URL, phone, address
5. Create `admins/config` doc with `allowedUids: ["your-google-uid"]`

---

## Square Integration

1. Go to [developer.squareup.com](https://developer.squareup.com/apps)
2. Create an app → copy your **Personal Access Token**
3. In Admin → Square Invoices, paste the token and save

---

## Google My Business Integration

1. In Admin → GMB, click "Connect Google My Business"
2. Authorize with the Google account that manages your Business Profile
3. Edit hours, description, and phone — click Save to push to Google

---

## Local Development

No build step needed:

```bash
# Option A — open directly
open index.html

# Option B — serve locally
npx serve .
# or
python3 -m http.server 8080
```

---

## Pricing Reference

| Item | Cost |
|---|---|
| Development (one-time) | $5,500 flat (see plan for itemized breakdown) |
| GitHub Pages hosting | Free |
| Firebase (Spark tier) | Free |
| Square (per transaction) | 2.6% + 10¢ |
| Custom domain (annual) | ~$15/yr |
| Maintenance retainer | $150–$350/mo |

---

## Project Codename

**Fiyah** 🔥
