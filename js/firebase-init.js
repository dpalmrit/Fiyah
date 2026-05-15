// Firebase configuration — replace with real project config before go-live
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain:        "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_WITH_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId:             "REPLACE_WITH_APP_ID"
};

// Seed menu data used as fallback when Firebase is not configured
const SEED_MENU = [
  { id:"1", name:"Jerk Chicken (Half)",    category:"Jerk Chicken", description:"Half bird marinated 24hrs in our signature scotch bonnet blend, wood-fire grilled to perfection.",    price:14.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", active:true },
  { id:"2", name:"Jerk Chicken (Whole)",   category:"Jerk Chicken", description:"Full bird — feeds two. Same bold marinade, smoky char on every piece.",                              price:24.99, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", active:true },
  { id:"3", name:"Jerk Chicken Wings",     category:"Jerk Chicken", description:"8 jumbo wings tossed in jerk sauce. Crispy outside, juicy inside.",                                  price:12.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", active:true },
  { id:"4", name:"Jerk Pork Ribs",         category:"Jerk Pork",    description:"Full rack slow-smoked with Caribbean spices. Falls off the bone.",                                   price:22.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", active:true },
  { id:"5", name:"Jerk Pork Chop",         category:"Jerk Pork",    description:"Thick-cut chop rubbed with allspice, thyme, and scotch bonnet. Grilled to order.",                  price:16.99, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", active:true },
  { id:"6", name:"Jerk Shrimp",            category:"Seafood",      description:"Jumbo shrimp skewers with island-spiced butter glaze.",                                             price:15.99, featured:true,  spicy:false, glutenFree:true,  vegan:false, emoji:"🍤", active:true },
  { id:"7", name:"Jerk Fish",              category:"Seafood",      description:"Snapper fillet marinated jerk-style, grilled over open flame.",                                     price:17.99, featured:false, spicy:false, glutenFree:true,  vegan:false, emoji:"🐟", active:true },
  { id:"8", name:"Rice & Peas",            category:"Sides",        description:"Coconut-braised kidney beans and rice — a Jamaican staple.",                                        price:3.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍚", active:true },
  { id:"9", name:"Festival (Sweet Dumpling)", category:"Sides",     description:"Slightly sweet fried cornmeal dumplings. The perfect jerk companion.",                             price:2.99,  featured:false, spicy:false, glutenFree:false, vegan:true,  emoji:"🌽", active:true },
  { id:"10", name:"Plantains",             category:"Sides",        description:"Sweet ripe plantains, pan-fried golden brown.",                                                     price:3.49,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍌", active:true },
  { id:"11", name:"Coleslaw",              category:"Sides",        description:"Creamy Caribbean-style slaw with a hint of lime.",                                                  price:2.99,  featured:false, spicy:false, glutenFree:true,  vegan:false, emoji:"🥗", active:true },
  { id:"12", name:"Sorrel Drink",          category:"Drinks",       description:"House-made hibiscus sorrel with ginger and clove. Served cold.",                                    price:3.99,  featured:true,  spicy:false, glutenFree:true,  vegan:true,  emoji:"🍹", active:true },
  { id:"13", name:"Ginger Beer",           category:"Drinks",       description:"Spicy authentic Jamaican ginger beer — imported.",                                                  price:3.49,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🧋", active:true },
  { id:"14", name:"Lemonade",              category:"Drinks",       description:"Fresh-squeezed with a Caribbean twist.",                                                            price:2.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍋", active:true },
  { id:"15", name:"Rum Cake",              category:"Desserts",     description:"Dense, moist Jamaican rum cake. Sold by the slice.",                                               price:4.99,  featured:true,  spicy:false, glutenFree:false, vegan:false, emoji:"🍰", active:true },
  { id:"16", name:"Coconut Pudding",       category:"Desserts",     description:"Silky coconut custard with toasted coconut flakes.",                                               price:4.49,  featured:false, spicy:false, glutenFree:true,  vegan:false, emoji:"🍮", active:true },
];

const SITE_SETTINGS = {
  doordashUrl:   "https://www.doordash.com",
  instagramUrl:  "https://www.instagram.com/jiggajerkjoint/",
  googleMapsUrl: "https://maps.google.com/?q=6200+NE+2+Ave,+Miami,+FL+33138",
  phone:         "(786) 694-1440",
  address:       "6200 NE 2 Ave\nMiami, FL 33138",
  hours: {
    mon: { closed: true },
    tue: { closed: true },
    wed: { open:"12:00", close:"18:00", closed:false },
    thu: { open:"12:00", close:"20:00", closed:false },
    fri: { open:"16:00", close:"00:00", closed:false },
    sat: { open:"16:00", close:"00:00", closed:false },
    sun: { open:"16:00", close:"22:00", closed:false },
  }
};

// ── Firebase bootstrap ───────────────────────────────────
let db = null;
let auth = null;
let storage = null;
let firebaseReady = false;

function initFirebase() {
  try {
    if (FIREBASE_CONFIG.apiKey === "REPLACE_WITH_FIREBASE_API_KEY") {
      console.info("[Fiyah] Firebase not configured — running in demo/localStorage mode.");
      return false;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db       = firebase.firestore();
    auth     = firebase.auth();
    storage  = firebase.storage();
    firebaseReady = true;
    console.info("[Fiyah] Firebase initialized.");
    return true;
  } catch (e) {
    console.warn("[Fiyah] Firebase init failed:", e.message);
    return false;
  }
}

// ── localStorage shim (demo mode) ───────────────────────
const LOCAL_KEY = "jjj_data";

function localGet(collection) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const store = raw ? JSON.parse(raw) : {};
    return store[collection] || null;
  } catch { return null; }
}

function localSet(collection, value) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const store = raw ? JSON.parse(raw) : {};
    store[collection] = value;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
  } catch(e) { console.error("localStorage write failed:", e); }
}

// Initialize on load
initFirebase();

// ── Menu data helpers ────────────────────────────────────
async function getMenuItems() {
  if (firebaseReady) {
    const snap = await db.collection("menu_items").where("active","==",true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const cached = localGet("menu_items");
  if (cached) return cached;
  localSet("menu_items", SEED_MENU);
  return SEED_MENU;
}

async function getFeaturedItems() {
  const all = await getMenuItems();
  return all.filter(i => i.featured);
}

async function getSiteSettings() {
  if (firebaseReady) {
    const doc = await db.collection("settings").doc("site").get();
    return doc.exists ? doc.data() : SITE_SETTINGS;
  }
  return localGet("site_settings") || SITE_SETTINGS;
}

// Toast helper
function showToast(msg, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === "success" ? "✓" : "✕"}</span> ${msg}`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
