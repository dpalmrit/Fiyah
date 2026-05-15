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
  { id:"1",  name:"Jerk Chicken (Whole)",  category:"Jerk Chicken", description:"Whole bird marinated 24 hrs in our signature scotch bonnet blend, wood-fire grilled. Served with white bread and three dipping sauces.",  price:24.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", photo:"img/jerk-chicken.jpg", active:true },
  { id:"2",  name:"Jerk Chicken (Half)",   category:"Jerk Chicken", description:"Half bird — same bold marinade, smoky char on every piece. Perfect for one.",                                                              price:14.99, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", active:true },
  { id:"3",  name:"Jerk Chicken Wings",    category:"Jerk Chicken", description:"8 jumbo wings with jerk seasoning, grilled crispy outside and juicy inside.",                                                             price:12.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", active:true },
  { id:"4",  name:"Jerk Pork",             category:"Jerk Pork",    description:"Slow-smoked chopped pork loaded with Caribbean spices — tender, smoky, and full of heat. Served with white bread and three sauces.",      price:18.99, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", photo:"img/jerk-pork.jpg", active:true },
  { id:"5",  name:"Jerk Pork Panini",      category:"Jerk Pork",    description:"Pressed panini packed with jerk pork, melted cheese, and island seasoning. Toasted golden on a flat press.",                             price:13.99, featured:true,  spicy:true,  glutenFree:false, vegan:false, emoji:"🥪", photo:"img/jerk-pork-panini.jpg", active:true },
  { id:"6",  name:"Jerk Shrimp",           category:"Seafood",      description:"Jumbo shrimp skewers basted with island-spiced butter glaze, grilled to order.",                                                          price:15.99, featured:false, spicy:false, glutenFree:true,  vegan:false, emoji:"🍤", active:true },
  { id:"7",  name:"Jerk Fish",             category:"Seafood",      description:"Whole fish marinated jerk-style, char-grilled in foil. Served with bammies and three dipping sauces.",                                    price:17.99, featured:true,  spicy:false, glutenFree:true,  vegan:false, emoji:"🐟", photo:"img/jerk-fish.jpg", active:true },
  { id:"8",  name:"Rice & Beans",          category:"Sides",        description:"Coconut-braised red kidney beans mixed into seasoned rice — a Jamaican staple in every order.",                                           price:3.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍚", photo:"img/rice-and-beans.jpg", active:true },
  { id:"9",  name:"Bammies",               category:"Sides",        description:"Grilled Jamaican cassava flatbreads — slightly crisp on the outside, soft inside. Three per order.",                                      price:3.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🫓", photo:"img/bammies.jpg", active:true },
  { id:"10", name:"Corn on the Cob",       category:"Sides",        description:"Grilled corn in foil with island butter seasoning. Sweet, smoky, and simple.",                                                            price:2.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🌽", photo:"img/corn-on-the-cob.jpg", active:true },
  { id:"11", name:"Festival (Sweet Dumpling)", category:"Sides",    description:"Slightly sweet fried cornmeal dumplings — the classic jerk companion.",                                                                   price:2.99,  featured:false, spicy:false, glutenFree:false, vegan:true,  emoji:"🌽", active:true },
  { id:"12", name:"Plantains",             category:"Sides",        description:"Sweet ripe plantains, pan-fried golden brown.",                                                                                            price:3.49,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍌", active:true },
  { id:"13", name:"Sorrel Drink",          category:"Drinks",       description:"House-made hibiscus sorrel with ginger and clove. Served cold.",                                                                           price:3.99,  featured:true,  spicy:false, glutenFree:true,  vegan:true,  emoji:"🍹", active:true },
  { id:"14", name:"Ginger Beer",           category:"Drinks",       description:"Spicy authentic Jamaican ginger beer — imported.",                                                                                         price:3.49,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🧋", active:true },
  { id:"15", name:"Lemonade",              category:"Drinks",       description:"Fresh-squeezed with a Caribbean twist.",                                                                                                   price:2.99,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍋", active:true },
  { id:"16", name:"Rum Cake",              category:"Desserts",     description:"Dense, moist Jamaican rum cake. Sold by the slice.",                                                                                       price:4.99,  featured:true,  spicy:false, glutenFree:false, vegan:false, emoji:"🍰", active:true },
  { id:"17", name:"Coconut Pudding",       category:"Desserts",     description:"Silky coconut custard with toasted coconut flakes.",                                                                                       price:4.49,  featured:false, spicy:false, glutenFree:true,  vegan:false, emoji:"🍮", active:true },
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
