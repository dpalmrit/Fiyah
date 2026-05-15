// Firebase configuration — replace with real project config before go-live
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain:        "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_WITH_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId:             "REPLACE_WITH_APP_ID"
};

// Seed menu data — mirrored from order.online/store/jigga-jerk-joint-24790075
const SEED_MENU = [
  // ── Jerk Chicken ──────────────────────────────────────────────────────────
  { id:"1",  name:"Jerk Chicken (1/4)",         category:"Jerk Chicken", description:"Quarter chicken marinated in our signature scotch bonnet blend, wood-fire grilled. Served with 1 slice of hard dough bread.",       price:13.20, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", photo:"img/jerk-chicken.avif", active:true },
  { id:"2",  name:"Jerk Chicken (1/2)",         category:"Jerk Chicken", description:"Half chicken — bold marinade, smoky char on every piece. Served with 2 slices of hard dough bread.",                                price:24.20, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", photo:"img/jerk-chicken.avif", active:true },
  { id:"3",  name:"Jerk Chicken (Whole)",       category:"Jerk Chicken", description:"Full bird — feeds the crew. Served with 4 slices of hard dough bread.",                                                             price:39.60, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🍗", photo:"img/jerk-chicken.avif", active:true },
  // ── Jerk Pork ─────────────────────────────────────────────────────────────
  { id:"4",  name:"Jerk Pork (1/4 lb)",        category:"Jerk Pork",    description:"Quarter pound slow-smoked chopped pork with Caribbean spices. Served with 1 slice of hard dough bread.",                            price:15.40, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", photo:"img/jerk-pork.avif", active:true },
  { id:"5",  name:"Jerk Pork (1/2 lb)",        category:"Jerk Pork",    description:"Half pound of tender, smoky jerk pork. Served with 2 slices of hard dough bread.",                                                  price:26.40, featured:true,  spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", photo:"img/jerk-pork.avif", active:true },
  { id:"6",  name:"Jerk Pork (1 lb)",          category:"Jerk Pork",    description:"A full pound of our signature jerk pork — enough for the whole table. Served with 4 slices of hard dough bread.",                  price:39.60, featured:false, spicy:true,  glutenFree:true,  vegan:false, emoji:"🥩", photo:"img/jerk-pork.avif", active:true },
  // ── Sandwiches ────────────────────────────────────────────────────────────
  { id:"7",  name:"Grilled Cheese Chicken",    category:"Sandwiches",   description:"Jerk chicken with a melted cheese blend, pressed and toasted on Caribbean bread.",                                                   price:14.00, featured:true,  spicy:true,  glutenFree:false, vegan:false, emoji:"🥪", photo:"img/jerk-chicken-sandwich.avif", active:true },
  { id:"8",  name:"Grilled Cheese Pork",       category:"Sandwiches",   description:"Slow-smoked jerk pork with melted cheese, pressed and toasted on Caribbean bread.",                                                  price:14.00, featured:false, spicy:true,  glutenFree:false, vegan:false, emoji:"🥪", photo:"img/jerk-pork-sandwich.avif", active:true },
  // ── Seafood ───────────────────────────────────────────────────────────────
  { id:"9",  name:"Jerk Salmon",               category:"Seafood",      description:"Salmon fillet seasoned with aromatic jerk spices and grilled in foil.",                                                              price:20.00, featured:true,  spicy:false, glutenFree:true,  vegan:false, emoji:"🐟", photo:"img/jerk-salmon.avif", active:true },
  // ── Sides ─────────────────────────────────────────────────────────────────
  { id:"10", name:"Rice and Peas",             category:"Sides",        description:"Coconut-braised red kidney beans mixed into seasoned rice — a Jamaican staple.",                                                     price:8.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍚", photo:"img/rice-and-peas.avif", active:true },
  { id:"11", name:"Roasted Corn",              category:"Sides",        description:"Sweet corn roasted to perfection with island seasoning.",                                                                             price:5.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🌽", photo:"img/roast-corn.avif", active:true },
  { id:"12", name:"Grilled Bammy",             category:"Sides",        description:"Traditional Jamaican cassava flatbread, grilled golden — perfect for soaking up jerk sauce.",                                        price:5.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🫓", photo:"img/bammy.avif", active:true },
  { id:"13", name:"Hard Dough Bread",          category:"Sides",        description:"Classic Caribbean-style bread for soaking up all those jerk flavors.",                                                               price:1.50,  featured:false, spicy:false, glutenFree:false, vegan:true,  emoji:"🍞", active:true },
  // ── Drinks ────────────────────────────────────────────────────────────────
  { id:"14", name:"Kola Champagne",            category:"Drinks",       description:"Classic Jamaican carbonated soda with that iconic Kola Champagne flavor.",                                                           price:4.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🥤", active:true },
  { id:"15", name:"Pineapple Soda",            category:"Drinks",       description:"Fizzy soda infused with tropical pineapple flavor.",                                                                                 price:4.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"🍹", active:true },
  { id:"16", name:"Water",                     category:"Drinks",       description:"Bottled water.",                                                                                                                      price:2.00,  featured:false, spicy:false, glutenFree:true,  vegan:true,  emoji:"💧", active:true },
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
