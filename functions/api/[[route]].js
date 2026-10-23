// —͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i — NEW PROJECT API (Cloudflare Pages Functions + D1)
// Database binding name must be: DB
// Everything on the site (logo, banners, texts, payment numbers) is controlled
// from the secret Admin page and stored in `settings` key 'site' as JSON.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const err = (msg, status = 400) => json({ error: msg }, status);

function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashWithSalt = (password, salt) => sha256(salt + "::" + password);

async function newSession(db, role, userId) {
  const token = randomHex(24);
  await db.prepare("INSERT INTO sessions (token, role, user_id, created_at) VALUES (?, ?, ?, datetime('now'))")
    .bind(token, role, userId ?? null).run();
  return token;
}
async function getSession(db, request) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  return db.prepare("SELECT * FROM sessions WHERE token = ?").bind(token).first();
}
async function requireAdmin(db, request) {
  const s = await getSession(db, request);
  return s && s.role === "admin" ? s : null;
}
async function requireUser(db, request) {
  const s = await getSession(db, request);
  if (!s || s.role !== "user") return null;
  const u = await db.prepare("SELECT * FROM users WHERE id = ?").bind(s.user_id).first();
  return u || null;
}
function couponDiscount(coupon, price) {
  if (!coupon) return 0;
  if (coupon.discount_type === "percent") return Math.floor((price * Number(coupon.discount_value)) / 100);
  return Math.min(Number(coupon.discount_value), price);
}
const parseJson = (s, fb) => { try { const v = JSON.parse(s || ""); return v ?? fb; } catch (e) { return fb; } };
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlToBytes = (s) => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const b64urlJson = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/* Auth: full admin, or staff with module permissions */
async function getAuth(db, request) {
  const s = await getSession(db, request);
  if (!s) return null;
  if (s.role === "admin") return { role: "admin", perms: ["*"] };
  if (s.role === "staff") {
    const st = await db.prepare("SELECT * FROM staff WHERE id = ? AND active = 1").bind(s.user_id).first();
    if (!st) return null;
    return { role: "staff", perms: parseJson(st.perms, []), staff: st };
  }
  return null;
}
async function requireModule(db, request, module) {
  const a = await getAuth(db, request);
  if (!a) return null;
  if (a.role === "admin" || a.perms.includes(module)) return a;
  return null;
}

/* Coupon validity (active + not expired + usage limit) */
async function checkCoupon(db, code, price) {
  const c = await db.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1").bind(code).first();
  if (!c) return { error: "এই কুপন কোডটি সঠিক নয় বা বন্ধ আছে" };
  if (c.expires_at && String(c.expires_at) < new Date().toISOString().slice(0, 10)) return { error: "এই কুপনের মেয়াদ শেষ হয়ে গেছে" };
  if (Number(c.max_uses) > 0 && Number(c.used_count || 0) >= Number(c.max_uses)) return { error: "এই কুপনের ব্যবহারের সীমা শেষ হয়ে গেছে" };
  return { coupon: c, discount: couponDiscount(c, price) };
}

/* ---------- Web Push (VAPID + aes128gcm, RFC 8291) ---------- */
async function getVapid(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key='vapid_keys'").first();
  return row ? parseJson(row.value, null) : null;
}
async function hkdf(ikm, salt, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}
async function vapidJwt(vapid, audience) {
  const jwk = parseJson(vapid.privateJwk, null);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64urlJson({ typ: "JWT", alg: "ES256" });
  const payload = b64urlJson({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: "mailto:owner@dark-broken.pages.dev" });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(header + "." + payload));
  return header + "." + payload + "." + b64url(sig);
}
async function sendOnePush(vapid, sub, payloadStr) {
  const uaPub = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64url(uaPub.slice(1, 33)), y: b64url(uaPub.slice(33, 65)) }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const info1 = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...uaPub, ...serverPub]);
  const ikm = await hkdf(shared, authSecret, info1, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array([...new TextEncoder().encode(payloadStr), 2]); // single record, final delimiter
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));
  const body = new Uint8Array(16 + 4 + 1 + 65 + cipher.length);
  body.set(salt, 0); body.set([0, 0, 0x10, 0, 65], 16); body.set(serverPub, 21); body.set(cipher, 86);
  const jwt = await vapidJwt(vapid, new URL(sub.endpoint).origin);
  const res = await fetch(sub.endpoint, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: "86400", Authorization: "vapid t=" + jwt + ", k=" + vapid.publicKey }, body });
  return res.status;
}
async function sendPushToAll(db, title, bodyText, link) {
  const vapid = await getVapid(db);
  if (!vapid) return { sent: 0, error: "VAPID key তৈরি হয়নি" };
  const { results } = await db.prepare("SELECT * FROM push_subs").all();
  const payload = JSON.stringify({ title, body: bodyText, url: link || "/" });
  let sent = 0;
  for (const sub of results) {
    try {
      const st = await sendOnePush(vapid, sub, payload);
      if (st === 404 || st === 410) await db.prepare("DELETE FROM push_subs WHERE id = ?").bind(sub.id).run();
      else if (st < 300) sent++;
    } catch (e) { /* skip broken subscription */ }
  }
  return { sent };
}

const SITE_DEFAULTS = {
  siteName: "—͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i",
  tagline: "Premium Software & Tools — Bangladesh",
  logoUrl: "",
  announcementOn: false,
  announcement: "",
  heroTitle: "Premium Software & Tools",
  heroSubtitle: "সেরা দামে, ঝামেলাহীন ডেলিভারি — bKash / Nagad / Rocket",
  whatsapp: "",
  payBkash: "",
  payNagad: "",
  payRocket: "",
  payNote: "উপরের নম্বরে Send Money করে নিচে আপনার নম্বর ও TrxID দিন।",
  deliveryMessage: "পেমেন্ট কনফার্ম হলে আপনার প্রোডাক্টের লাইসেন্স/লিংক এই Dashboard-এর 'My Deliveries' অংশে পেয়ে যাবেন।",
  showFeatured: true,
  popupOn: false,
  popupTitle: "",
  popupText: "",
  popupImage: "",
  popupLink: "",
  popupBtn: "অফারটি দেখুন",
  homeOrder: ["hero", "features", "featured", "catalog"],
  homeHidden: [],
  maintenance: false,
  maintenanceText: "সাইটে আপডেটের কাজ চলছে — কিছুক্ষণ পরে আবার আসুন।",
  policyDelivery: "আমরা ডিজিটাল প্রোডাক্ট বিক্রি করি। পেমেন্ট কনফার্ম হওয়ার পর সাধারণত ১০ মিনিট থেকে ২ ঘণ্টার মধ্যে ডেলিভারি দেওয়া হয়; বিশেষ ক্ষেত্রে সর্বোচ্চ ২৪ ঘণ্টা। ডেলিভারি আপনার অ্যাকাউন্টের Dashboard-এ পৌঁছে যাবে।",
  policyRefund: "ডেলিভারি দেওয়া সম্ভব না হলে সম্পূর্ণ রিফান্ড। ডেলিভারি পাওয়া প্রোডাক্টে আমাদের ত্রুটি থাকলে প্রথমে সমাধান/রিপ্লেসমেন্ট; সমাধান না হলে রিফান্ড। সঠিকভাবে ডেলিভারি পাওয়া প্রোডাক্টে রিফান্ড প্রযোজ্য নয়। রিফান্ড ২৪–৭২ ঘণ্টায় একই মাধ্যমে পাঠানো হয়।",
  policyPrivacy: "আমরা শুধু Order প্রসেসিংয়ের জন্য প্রয়োজনীয় তথ্য (নাম, মোবাইল, পেমেন্ট তথ্য) সংগ্রহ করি। আপনার তথ্য তৃতীয় পক্ষের কাছে বিক্রি বা শেয়ার করা হয় না। পাসওয়ার্ড এনক্রিপ্ট করে রাখা হয়।",
  policyTerms: "(১) কেনা সফটওয়্যার/লাইসেন্স শুধু ব্যক্তিগত ব্যবহারের জন্য; পুনঃবিক্রি বা শেয়ার নিষিদ্ধ। (২) ভুল TrxID/নম্বর দিলে ডেলিভারি বিলম্বের দায় ক্রেতার। (৩) দাম যেকোনো সময় বদলাতে পারে; কনফার্ম হওয়া Order আগের দামেই প্রযোজ্য।",
  policyAbout: "—͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i — বাংলাদেশে প্রিমিয়াম সফটওয়্যার ও টুলসের বিশ্বস্ত দোকান। সাহায্যের জন্য WhatsApp বাটনে মেসেজ করুন।",
};
async function getSite(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key='site'").first();
  if (!row) return { ...SITE_DEFAULTS };
  try { return { ...SITE_DEFAULTS, ...JSON.parse(row.value) }; } catch (e) { return { ...SITE_DEFAULTS }; }
}
async function attachVariants(db, products, full = false) {
  const { results: vars } = await db.prepare("SELECT * FROM product_variants ORDER BY id").all();
  const { results: soldRows } = await db.prepare("SELECT product_id, COUNT(*) AS n FROM orders WHERE status != 'Cancelled' GROUP BY product_id").all();
  const soldMap = {}; for (const r of soldRows) soldMap[r.product_id] = r.n;
  for (const p of products) {
    p.variants = vars.filter((v) => v.product_id === p.id);
    const { results: st } = await db.prepare(
      "SELECT variant_id, COUNT(*) AS n FROM delivery_stock WHERE product_id = ? AND status='available' GROUP BY variant_id"
    ).bind(p.id).all();
    p.stock = st;
    p.sold = soldMap[p.id] || 0;
    p.images = parseJson(p.images, []);
    p.faq = parseJson(p.faq, []);
    if (!full) {
      p.has_file = !!p.delivery_file;
      delete p.delivery_file;
      delete p.delivery_link;
    } else {
      try { p.delivery_file_obj = p.delivery_file ? JSON.parse(p.delivery_file) : null; } catch (e) { p.delivery_file_obj = null; }
    }
  }
  return products;
}
async function maybeDeliver(db, order) {
  // Auto-delivery: when an order becomes Confirmed/Delivered, assign one stock item.
  if (!["Confirmed", "Delivered"].includes(order.status)) return order;
  if (order.delivery_content) {
    // Already delivered (e.g. manually) — just stamp delivery/expiry dates once.
    if (order.status === "Delivered" && !order.delivered_at) {
      const days = Number(order.duration_days || 0);
      const exp = days > 0 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : (order.expires_at || "");
      await db.prepare("UPDATE orders SET delivered_at = datetime('now'), expires_at = ? WHERE id = ?").bind(exp, order.id).run();
      order.delivered_at = "now"; order.expires_at = exp;
    }
    return order;
  }
  let item = null;
  if (order.variant_id) {
    item = await db.prepare("SELECT * FROM delivery_stock WHERE product_id = ? AND variant_id = ? AND status='available' ORDER BY id LIMIT 1")
      .bind(order.product_id, order.variant_id).first();
  }
  if (!item) {
    item = await db.prepare("SELECT * FROM delivery_stock WHERE product_id = ? AND (variant_id IS NULL) AND status='available' ORDER BY id LIMIT 1")
      .bind(order.product_id).first();
  }
  if (!item && !order.variant_id) {
    item = await db.prepare("SELECT * FROM delivery_stock WHERE product_id = ? AND status='available' ORDER BY id LIMIT 1")
      .bind(order.product_id).first();
  }
  let content = item ? item.content : "";
  if (item) {
    await db.prepare("UPDATE delivery_stock SET status='assigned', order_id = ? WHERE id = ?").bind(order.id, item.id).run();
  } else {
    // Fall back to the product's own delivery file/link (set in the product form).
    const prod = await db.prepare("SELECT delivery_link, delivery_file FROM products WHERE id = ?").bind(order.product_id).first();
    if (prod && prod.delivery_file) {
      try { const f = JSON.parse(prod.delivery_file); if (f && f.data) content = "FILE::" + (f.name || "download") + "::" + f.data; } catch (e) {}
    }
    if (!content && prod && prod.delivery_link) content = prod.delivery_link;
  }
  if (!content) return order; // nothing to deliver yet — admin delivers manually
  const days = Number(order.duration_days || 0);
  const exp = days > 0 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : "";
  await db.prepare("UPDATE orders SET delivery_content = ?, delivered_at = datetime('now'), expires_at = ? WHERE id = ?").bind(content, exp, order.id).run();
  order.delivery_content = content;
  order.expires_at = exp;
  return order;
}

// Auto-create tables on first use so the D1 Console step is never needed.
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL, old_price INTEGER, category TEXT DEFAULT '', image_url TEXT DEFAULT '', images TEXT DEFAULT '', delivery_link TEXT DEFAULT '', delivery_file TEXT DEFAULT '', faq TEXT DEFAULT '', duration_days INTEGER DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS product_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, label TEXT NOT NULL, price INTEGER NOT NULL, old_price INTEGER, duration_days INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT DEFAULT '', subtitle TEXT DEFAULT '', button_text TEXT DEFAULT '', button_link TEXT DEFAULT '', image_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, mobile TEXT UNIQUE NOT NULL, email TEXT DEFAULT '', pass_hash TEXT NOT NULL, salt TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, discount_type TEXT NOT NULL DEFAULT 'percent', discount_value INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, expires_at TEXT DEFAULT '', max_uses INTEGER DEFAULT 0, used_count INTEGER DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS delivery_stock (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, variant_id INTEGER, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', order_id INTEGER, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, variant_id INTEGER, variant_label TEXT DEFAULT '', price INTEGER NOT NULL, discount INTEGER DEFAULT 0, coupon_code TEXT DEFAULT '', payment_method TEXT NOT NULL, payment_number TEXT NOT NULL, trx_id TEXT NOT NULL, customer_name TEXT NOT NULL, customer_mobile TEXT NOT NULL, delivery_content TEXT DEFAULT '', duration_days INTEGER DEFAULT 0, delivered_at TEXT DEFAULT '', expires_at TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS wishlist (user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT, PRIMARY KEY (user_id, product_id))`,
    `CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_id INTEGER, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, perms TEXT DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (identifier TEXT PRIMARY KEY, fails INTEGER DEFAULT 0, locked_until TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT DEFAULT '', data TEXT, created_at TEXT)`,
  ];
  await db.batch(stmts.map((s) => db.prepare(s)));
  // Migrations for databases created by the older version (ignore "duplicate column" errors).
  const alters = [
    "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN images TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN delivery_link TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN delivery_file TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN faq TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN duration_days INTEGER DEFAULT 0",
    "ALTER TABLE product_variants ADD COLUMN duration_days INTEGER DEFAULT 0",
    "ALTER TABLE coupons ADD COLUMN expires_at TEXT DEFAULT ''",
    "ALTER TABLE coupons ADD COLUMN max_uses INTEGER DEFAULT 0",
    "ALTER TABLE coupons ADD COLUMN used_count INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN duration_days INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN delivered_at TEXT DEFAULT ''",
    "ALTER TABLE orders ADD COLUMN expires_at TEXT DEFAULT ''",
  ];
  for (const a of alters) { try { await db.prepare(a).run(); } catch (e) { /* column already exists */ } }
  schemaReady = true;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const db = env.DB;
  if (!db) return err("Database not connected. Bind your D1 database as DB in Cloudflare Pages settings.", 500);
  await ensureSchema(db);
  const route = (params.route || []).join("/");
  const method = request.method;
  const url = new URL(request.url);
  let body = {};
  if (["POST", "PUT", "PATCH"].includes(method)) body = await request.json().catch(() => ({}));

  try {
    /* ---------- Site settings (public read / admin write) ---------- */
    if (route === "settings" && method === "GET") {
      return json({ site: await getSite(db) });
    }
    if (route === "admin/settings" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const current = await getSite(db);
      const next = { ...current };
      for (const k of Object.keys(SITE_DEFAULTS)) {
        if (body[k] !== undefined) next[k] = body[k];
      }
      await db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(JSON.stringify(next)).run();
      return json({ ok: true, site: next });
    }

    /* ---------- Banners ---------- */
    if (route === "banners" && method === "GET") {
      const { results } = await db.prepare("SELECT * FROM banners WHERE active = 1 ORDER BY sort, id").all();
      return json({ banners: results });
    }
    if (route === "admin/banners" && method === "GET") {
      if (!(await requireModule(db, request, "banners"))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM banners ORDER BY sort, id").all();
      return json({ banners: results });
    }
    if (route === "admin/banners" && method === "POST") {
      if (!(await requireModule(db, request, "banners"))) return err("Admin login required", 401);
      const r = await db.prepare(
        "INSERT INTO banners (title, subtitle, button_text, button_link, image_url, active, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(body.title || "", body.subtitle || "", body.buttonText || "", body.buttonLink || "", body.imageUrl || "", body.active === false ? 0 : 1, Number(body.sort) || 0).run();
      return json({ id: r.meta.last_row_id });
    }
    const bannerMatch = route.match(/^admin\/banners\/(\d+)$/);
    if (bannerMatch && method === "PUT") {
      if (!(await requireModule(db, request, "banners"))) return err("Admin login required", 401);
      await db.prepare("UPDATE banners SET title=?, subtitle=?, button_text=?, button_link=?, image_url=?, active=?, sort=? WHERE id=?")
        .bind(body.title || "", body.subtitle || "", body.buttonText || "", body.buttonLink || "", body.imageUrl || "", body.active === false ? 0 : 1, Number(body.sort) || 0, Number(bannerMatch[1])).run();
      return json({ ok: true });
    }
    if (bannerMatch && method === "DELETE") {
      if (!(await requireModule(db, request, "banners"))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM banners WHERE id = ?").bind(Number(bannerMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Products ---------- */
    if (route === "products" && method === "GET") {
      const { results } = await db.prepare("SELECT * FROM products ORDER BY id DESC").all();
      return json({ products: await attachVariants(db, results) });
    }
    async function saveVariants(productId, variants) {
      await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(productId).run();
      for (const v of variants || []) {
        if (!v.label || !v.price) continue;
        await db.prepare("INSERT INTO product_variants (product_id, label, price, old_price, duration_days) VALUES (?, ?, ?, ?, ?)")
          .bind(productId, v.label, Number(v.price), v.oldPrice ?? null, Number(v.durationDays) || 0).run();
      }
    }
    const prodFields = (b) => {
      const images = Array.isArray(b.images) ? b.images.filter((x) => typeof x === "string" && x).slice(0, 8) : [];
      const faq = Array.isArray(b.faq) ? b.faq.filter((f) => f && f.q && f.a).slice(0, 12).map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 1000) })) : [];
      let deliveryFile = "";
      if (b.deliveryFile && b.deliveryFile.data) {
        if (String(b.deliveryFile.data).length > 2000000) throw new Error("ডেলিভারি ফাইল খুব বড় (সর্বোচ্চ ~1.5MB) — বড় ফাইলের জন্য ডাউনলোড লিংক ব্যবহার করুন");
        deliveryFile = JSON.stringify({ name: String(b.deliveryFile.name || "download").slice(0, 120), data: String(b.deliveryFile.data) });
      } else if (typeof b.deliveryFile === "string") deliveryFile = b.deliveryFile;
      return {
        images: JSON.stringify(images), faq: JSON.stringify(faq), deliveryFile,
        deliveryLink: String(b.deliveryLink || "").slice(0, 1000), durationDays: Number(b.durationDays) || 0,
      };
    };
    if (route === "admin/products" && method === "GET") {
      if (!(await requireModule(db, request, "products"))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM products ORDER BY id DESC").all();
      return json({ products: await attachVariants(db, results, true) });
    }
    if (route === "products" && method === "POST") {
      if (!(await requireModule(db, request, "products"))) return err("Admin login required", 401);
      if (!body.name || !body.price) return err("Name and price required");
      const f = prodFields(body);
      const r = await db.prepare(
        "INSERT INTO products (name, description, price, old_price, category, image_url, images, delivery_link, delivery_file, faq, duration_days, featured, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(body.name, body.description || "", Number(body.price), body.oldPrice ?? null, body.category || "", body.imageUrl || "", f.images, f.deliveryLink, f.deliveryFile, f.faq, f.durationDays, body.featured ? 1 : 0).run();
      await saveVariants(r.meta.last_row_id, body.variants);
      return json({ id: r.meta.last_row_id });
    }
    const prodMatch = route.match(/^products\/(\d+)$/);
    if (prodMatch && (method === "PUT" || method === "DELETE")) {
      if (!(await requireModule(db, request, "products"))) return err("Admin login required", 401);
      const id = Number(prodMatch[1]);
      if (method === "DELETE") {
        await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
        await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id).run();
        return json({ ok: true });
      }
      const f = prodFields(body);
      await db.prepare("UPDATE products SET name=?, description=?, price=?, old_price=?, category=?, image_url=?, images=?, delivery_link=?, delivery_file=?, faq=?, duration_days=?, featured=? WHERE id=?")
        .bind(body.name, body.description || "", Number(body.price), body.oldPrice ?? null, body.category || "", body.imageUrl || "", f.images, f.deliveryLink, f.deliveryFile, f.faq, f.durationDays, body.featured ? 1 : 0, id).run();
      await saveVariants(id, body.variants);
      return json({ ok: true });
    }

    /* ---------- Delivery stock (admin) ---------- */
    if (route === "admin/stock" && method === "GET") {
      if (!(await requireModule(db, request, "stock"))) return err("Admin login required", 401);
      const pid = Number(url.searchParams.get("productId"));
      const q = pid
        ? db.prepare("SELECT * FROM delivery_stock WHERE product_id = ? ORDER BY id DESC").bind(pid)
        : db.prepare("SELECT * FROM delivery_stock ORDER BY id DESC LIMIT 200");
      const { results } = await q.all();
      return json({ stock: results });
    }
    if (route === "admin/stock" && method === "POST") {
      if (!(await requireModule(db, request, "stock"))) return err("Admin login required", 401);
      const lines = String(body.items || "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (!body.productId || !lines.length) return err("প্রোডাক্ট আর অন্তত একটা কী/লিংক দিন");
      for (const content of lines) {
        await db.prepare("INSERT INTO delivery_stock (product_id, variant_id, content, status, created_at) VALUES (?, ?, ?, 'available', datetime('now'))")
          .bind(Number(body.productId), body.variantId ? Number(body.variantId) : null, content).run();
      }
      return json({ ok: true, added: lines.length });
    }
    const stockMatch = route.match(/^admin\/stock\/(\d+)$/);
    if (stockMatch && method === "DELETE") {
      if (!(await requireModule(db, request, "stock"))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM delivery_stock WHERE id = ? AND status='available'").bind(Number(stockMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Admin auth ---------- */
    if (route === "admin/status" && method === "GET") {
      const row = await db.prepare("SELECT value FROM settings WHERE key='admin_hash'").first();
      return json({ setup: !!row });
    }
    if (route === "admin/setup" && method === "POST") {
      const existing = await db.prepare("SELECT value FROM settings WHERE key='admin_hash'").first();
      if (existing) return err("Admin passcode already set. Use login.", 403);
      if (!body.passcode || String(body.passcode).length < 4) return err("Passcode কমপক্ষে 4 অক্ষরের হতে হবে");
      const salt = randomHex(8);
      const hash = await hashWithSalt(String(body.passcode), salt);
      await db.prepare("INSERT INTO settings (key, value) VALUES ('admin_hash', ?), ('admin_salt', ?)").bind(hash, salt).run();
      return json({ token: await newSession(db, "admin", null) });
    }
    if (route === "admin/login" && method === "POST") {
      const hashRow = await db.prepare("SELECT value FROM settings WHERE key='admin_hash'").first();
      const saltRow = await db.prepare("SELECT value FROM settings WHERE key='admin_salt'").first();
      if (!hashRow) return err("Admin passcode এখনো সেট করা হয়নি", 403);
      const hash = await hashWithSalt(String(body.passcode || ""), saltRow.value);
      if (hash !== hashRow.value) return err("ভুল passcode", 401);
      return json({ token: await newSession(db, "admin", null) });
    }

    /* ---------- Admin stats ---------- */
    if (route === "admin/stats" && method === "GET") {
      if (!(await getAuth(db, request))) return err("Admin login required", 401);
      const one = async (sql) => (await db.prepare(sql).first()) || {};
      const rev = await one("SELECT COALESCE(SUM(price - COALESCE(discount,0)),0) AS v FROM orders WHERE status != 'Cancelled'");
      const tot = await one("SELECT COUNT(*) AS v FROM orders");
      const pen = await one("SELECT COUNT(*) AS v FROM orders WHERE status = 'Pending'");
      const del = await one("SELECT COUNT(*) AS v FROM orders WHERE status = 'Delivered'");
      const prods = await one("SELECT COUNT(*) AS v FROM products");
      const users = await one("SELECT COUNT(*) AS v FROM users");
      const lowStock = await one("SELECT COUNT(*) AS v FROM (SELECT product_id FROM delivery_stock WHERE status='available' GROUP BY product_id HAVING COUNT(*) <= 2)");
      return json({ revenue: rev.v, totalOrders: tot.v, pendingOrders: pen.v, deliveredOrders: del.v, totalProducts: prods.v, totalUsers: users.v, lowStockProducts: lowStock.v });
    }

    /* ---------- Admin users ---------- */
    if (route === "admin/users" && method === "GET") {
      if (!(await requireModule(db, request, "users"))) return err("Admin login required", 401);
      const { results } = await db.prepare(
        "SELECT u.id, u.name, u.mobile, u.email, u.blocked, u.created_at, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.price - COALESCE(o.discount,0) ELSE 0 END),0) AS spent FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id ORDER BY u.id DESC"
      ).all();
      return json({ users: results });
    }
    const userMatch = route.match(/^admin\/users\/(\d+)$/);
    if (userMatch && method === "PATCH") {
      if (!(await requireModule(db, request, "users"))) return err("Admin login required", 401);
      const uid = Number(userMatch[1]);
      if (body.blocked !== undefined) {
        await db.prepare("UPDATE users SET blocked = ? WHERE id = ?").bind(body.blocked ? 1 : 0, uid).run();
      }
      if (body.email !== undefined) {
        const email = String(body.email || "").trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("সঠিক ইমেইল দিন");
        if (email) {
          const dup = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").bind(email, uid).first();
          if (dup) return err("এই ইমেইল অন্য অ্যাকাউন্টে আছে");
        }
        await db.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email, uid).run();
      }
      if (body.newPassword) {
        if (String(body.newPassword).length < 4) return err("পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
        const salt = randomHex(8);
        const hash = await hashWithSalt(String(body.newPassword), salt);
        await db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, uid).run();
      }
      return json({ ok: true });
    }

    /* ---------- Coupons ---------- */
    if (route === "coupons/validate" && method === "GET") {
      const code = (url.searchParams.get("code") || "").trim().toUpperCase();
      const price = Number(url.searchParams.get("price"));
      if (!code || !price) return err("Coupon code দিন");
      const chk = await checkCoupon(db, code, price);
      if (chk.error) return err(chk.error);
      return json({ code, discount: chk.discount, payable: price - chk.discount });
    }
    if (route === "admin/coupons" && method === "GET") {
      if (!(await requireModule(db, request, "coupons"))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM coupons ORDER BY id DESC").all();
      return json({ coupons: results });
    }
    if (route === "admin/coupons" && method === "POST") {
      if (!(await requireModule(db, request, "coupons"))) return err("Admin login required", 401);
      const code = String(body.code || "").trim().toUpperCase();
      const type = body.discountType === "flat" ? "flat" : "percent";
      const value = Number(body.discountValue);
      if (!code || !value || value <= 0) return err("কুপন কোড আর সঠিক discount মান দিন");
      if (type === "percent" && value > 100) return err("Percent discount 100-এর বেশি হতে পারে না");
      const exists = await db.prepare("SELECT id FROM coupons WHERE code = ?").bind(code).first();
      if (exists) return err("এই কোড দিয়ে আগেই কুপন আছে");
      const r = await db.prepare("INSERT INTO coupons (code, discount_type, discount_value, active, expires_at, max_uses, used_count, created_at) VALUES (?, ?, ?, 1, ?, ?, 0, datetime('now'))")
        .bind(code, type, value, String(body.expiresAt || "").slice(0, 10), Number(body.maxUses) || 0).run();
      return json({ id: r.meta.last_row_id });
    }
    const couponMatch = route.match(/^admin\/coupons\/(\d+)$/);
    if (couponMatch && method === "DELETE") {
      if (!(await requireModule(db, request, "coupons"))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM coupons WHERE id = ?").bind(Number(couponMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- User auth ---------- */
    if (route === "auth/register" && method === "POST") {
      const { name, mobile, password } = body;
      const email = String(body.email || "").trim().toLowerCase();
      if (!name || !mobile || !password) return err("নাম, মোবাইল আর পাসওয়ার্ড আবশ্যক");
      if (!/^01\d{9}$/.test(String(mobile))) return err("সঠিক 11 ডিজিটের মোবাইল নম্বর দিন (01...)");
      if (String(password).length < 4) return err("পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("সঠিক ইমেইল ঠিকানা দিন");
      const exists = await db.prepare("SELECT id FROM users WHERE mobile = ?").bind(mobile).first();
      if (exists) return err("এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে — Login করুন");
      if (email) {
        const eExists = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (eExists) return err("এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে — Login করুন");
      }
      const salt = randomHex(8);
      const hash = await hashWithSalt(String(password), salt);
      const r = await db.prepare("INSERT INTO users (name, mobile, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
        .bind(name, mobile, email, hash, salt).run();
      return json({ token: await newSession(db, "user", r.meta.last_row_id), name });
    }
    if (route === "auth/login" && method === "POST") {
      const identifier = String(body.identifier || body.mobile || body.email || "").trim().toLowerCase();
      if (!identifier) return err("মোবাইল নম্বর বা ইমেইল দিন", 401);
      // Lockout: 5 wrong tries → 15 minutes locked (per identifier).
      const att = await db.prepare("SELECT * FROM login_attempts WHERE identifier = ?").bind(identifier).first();
      if (att && att.locked_until && att.locked_until > new Date().toISOString()) {
        return err("অনেকবার ভুল চেষ্টা হয়েছে — নিরাপত্তার জন্য ১৫ মিনিট লক করা হলো। পরে আবার চেষ্টা করুন।", 429);
      }
      const user = await db.prepare("SELECT * FROM users WHERE mobile = ? OR (email != '' AND email = ?)").bind(identifier, identifier).first();
      const fail = async () => {
        const fails = (att ? Number(att.fails || 0) : 0) + 1;
        const lock = fails >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : (att ? att.locked_until || "" : "");
        await db.prepare("INSERT INTO login_attempts (identifier, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(identifier) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until")
          .bind(identifier, fails, lock).run();
      };
      if (!user) { await fail(); return err("এই নম্বর/ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে Register করুন", 401); }
      const hash = await hashWithSalt(String(body.password || ""), user.salt);
      if (hash !== user.pass_hash) { await fail(); return err("ভুল পাসওয়ার্ড", 401); }
      if (user.blocked) return err("আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে — সাপোর্টে যোগাযোগ করুন", 403);
      await db.prepare("DELETE FROM login_attempts WHERE identifier = ?").bind(identifier).run();
      return json({ token: await newSession(db, "user", user.id), name: user.name });
    }

    /* ---------- Me (customer dashboard) ---------- */
    if (route === "me" && method === "GET") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      return json({ user: { id: u.id, name: u.name, mobile: u.mobile, email: u.email || "", blocked: u.blocked, created_at: u.created_at } });
    }
    if (route === "me" && method === "PATCH") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      if (!body.name || !String(body.name).trim()) return err("নাম দিন");
      await db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(String(body.name).trim(), u.id).run();
      if (body.email !== undefined) {
        const email = String(body.email || "").trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("সঠিক ইমেইল দিন");
        if (email) {
          const dup = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").bind(email, u.id).first();
          if (dup) return err("এই ইমেইল অন্য অ্যাকাউন্টে আছে");
        }
        await db.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email, u.id).run();
      }
      return json({ ok: true });
    }
    if (route === "me/password" && method === "POST") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      const hash = await hashWithSalt(String(body.oldPassword || ""), u.salt);
      if (hash !== u.pass_hash) return err("বর্তমান পাসওয়ার্ড ভুল", 401);
      if (!body.newPassword || String(body.newPassword).length < 4) return err("নতুন পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
      const salt = randomHex(8);
      const nh = await hashWithSalt(String(body.newPassword), salt);
      await db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?").bind(nh, salt, u.id).run();
      return json({ ok: true });
    }

    /* ---------- Orders ---------- */
    if (route === "orders" && method === "POST") {
      const u = await requireUser(db, request);
      if (!u) return err("Order করতে আগে Login করুন", 401);
      if (u.blocked) return err("আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে", 403);
      const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(Number(body.productId)).first();
      if (!product) return err("Product not found", 404);
      let price = product.price, variantId = null, variantLabel = "", durationDays = Number(product.duration_days || 0);
      if (body.variantId) {
        const v = await db.prepare("SELECT * FROM product_variants WHERE id = ? AND product_id = ?").bind(Number(body.variantId), product.id).first();
        if (!v) return err("Variant not found", 404);
        price = v.price; variantId = v.id; variantLabel = v.label;
        if (Number(v.duration_days) > 0) durationDays = Number(v.duration_days);
      }
      if (!body.customerName || !body.customerMobile) return err("নাম আর মোবাইল নম্বর দিন");
      if (!["bKash", "Nagad", "Rocket"].includes(body.paymentMethod)) return err("পেমেন্ট মেথড বেছে নিন");
      if (!body.paymentNumber || !body.trxId) return err("পেমেন্ট নম্বর আর TrxID দিন");
      // TrxID can never be reused — fraud protection.
      const dupTrx = await db.prepare("SELECT id FROM orders WHERE UPPER(trx_id) = UPPER(?)").bind(String(body.trxId).trim()).first();
      if (dupTrx) return err("এই TrxID দিয়ে আগেই একটা অর্ডার করা হয়েছে (Order #" + dupTrx.id + ") — সঠিক TrxID দিন, বারবার একই TrxID চলবে না");
      let discount = 0, couponCode = "";
      if (body.couponCode) {
        const chk = await checkCoupon(db, String(body.couponCode).trim().toUpperCase(), price);
        if (chk.error) return err(chk.error);
        discount = chk.discount;
        couponCode = chk.coupon.code;
      }
      const r = await db.prepare(
        `INSERT INTO orders (user_id, product_id, product_name, variant_id, variant_label, price, discount, coupon_code, payment_method, payment_number, trx_id, customer_name, customer_mobile, duration_days, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', datetime('now'))`
      ).bind(u.id, product.id, product.name, variantId, variantLabel, price, discount, couponCode, body.paymentMethod, body.paymentNumber, String(body.trxId).trim(), body.customerName, body.customerMobile, durationDays).run();
      if (couponCode) await db.prepare("UPDATE coupons SET used_count = COALESCE(used_count,0) + 1 WHERE code = ?").bind(couponCode).run();
      return json({ orderId: r.meta.last_row_id, discount, payable: price - discount });
    }
    if (route === "my/orders" && method === "GET") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      const { results } = await db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").bind(u.id).all();
      return json({ orders: results });
    }
    if (route === "admin/orders" && method === "GET") {
      if (!(await requireModule(db, request, "orders"))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
      return json({ orders: results });
    }
    const ordMatch = route.match(/^admin\/orders\/(\d+)$/);
    if (ordMatch && method === "PATCH") {
      if (!(await requireModule(db, request, "orders"))) return err("Admin login required", 401);
      if (body.deliveryContent !== undefined) {
        await db.prepare("UPDATE orders SET delivery_content = ? WHERE id = ?").bind(String(body.deliveryContent || ""), Number(ordMatch[1])).run();
        return json({ ok: true });
      }
      if (!["Pending", "Confirmed", "Delivered", "Cancelled"].includes(body.status)) return err("Invalid status");
      await db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(body.status, Number(ordMatch[1])).run();
      const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(Number(ordMatch[1])).first();
      await maybeDeliver(db, order);
      const fresh = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(Number(ordMatch[1])).first();
      return json({ ok: true, delivered: !!fresh.delivery_content });
    }

    /* ---------- Who am I (admin page role detection) ---------- */
    if (route === "admin/whoami" && method === "GET") {
      const a = await getAuth(db, request);
      if (!a) return err("Login required", 401);
      return json({ role: a.role, perms: a.perms, name: a.staff ? a.staff.name : "Admin" });
    }

    /* ---------- Public order tracking ---------- */
    if (route === "track" && method === "GET") {
      const oid = Number(url.searchParams.get("orderId"));
      const mobile = String(url.searchParams.get("mobile") || "").trim();
      if (!oid || !mobile) return err("Order ID আর মোবাইল নম্বর দিন");
      const o = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(oid).first();
      if (!o || (o.customer_mobile !== mobile && o.payment_number !== mobile)) return err("এই তথ্যে কোনো অর্ডার পাওয়া যায়নি — Order ID ও অর্ডারের মোবাইল নম্বর মিলিয়ে আবার দিন");
      return json({ order: { id: o.id, product_name: o.product_name, variant_label: o.variant_label, price: o.price - (o.discount || 0), status: o.status, created_at: o.created_at, delivered: !!o.delivery_content, expires_at: o.expires_at || "" } });
    }

    /* ---------- Wishlist ---------- */
    if (route === "wishlist" && method === "GET") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      const { results } = await db.prepare("SELECT product_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(u.id).all();
      const ids = results.map((r) => r.product_id);
      if (!ids.length) return json({ items: [], ids: [] });
      const { results: prods } = await db.prepare("SELECT * FROM products ORDER BY id DESC").all();
      const items = await attachVariants(db, prods.filter((p) => ids.includes(p.id)));
      return json({ items, ids });
    }
    if (route === "wishlist" && method === "POST") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      const pid = Number(body.productId);
      if (!pid) return err("Product required");
      await db.prepare("INSERT OR IGNORE INTO wishlist (user_id, product_id, created_at) VALUES (?, ?, datetime('now'))").bind(u.id, pid).run();
      return json({ ok: true });
    }
    const wishMatch = route.match(/^wishlist\/(\d+)$/);
    if (wishMatch && method === "DELETE") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      await db.prepare("DELETE FROM wishlist WHERE user_id = ? AND product_id = ?").bind(u.id, Number(wishMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Web Push ---------- */
    if (route === "push/key" && method === "GET") {
      const v = await getVapid(db);
      return json({ publicKey: v ? v.publicKey : "" });
    }
    if (route === "push/subscribe" && method === "POST") {
      const sub = body.subscription || body;
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return err("Invalid subscription");
      const u = await requireUser(db, request).catch(() => null);
      await db.prepare("INSERT INTO push_subs (endpoint, p256dh, auth, user_id, created_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth")
        .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, u ? u.id : null).run();
      return json({ ok: true });
    }
    if (route === "admin/push/keygen" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const pubRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
      const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      const vapid = { publicKey: b64url(pubRaw), privateJwk: JSON.stringify({ kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, d: privJwk.d }) };
      await db.prepare("INSERT INTO settings (key, value) VALUES ('vapid_keys', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(vapid)).run();
      return json({ ok: true, publicKey: vapid.publicKey });
    }
    if (route === "admin/push/send" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      if (!body.title) return err("নোটিফিকেশনের শিরোনাম দিন");
      const r = await sendPushToAll(db, String(body.title), String(body.bodyText || ""), String(body.link || "/"));
      if (r.error) return err(r.error + " — আগে Push Key তৈরি করুন");
      return json({ ok: true, sent: r.sent });
    }

    /* ---------- Custom pages (admin-built, no coding) ---------- */
    if (route === "pages" && method === "GET") {
      const { results } = await db.prepare("SELECT slug, title FROM pages WHERE active = 1 ORDER BY id").all();
      return json({ pages: results });
    }
    const pageMatch = route.match(/^pages\/([a-z0-9-]+)$/);
    if (pageMatch && method === "GET") {
      const p = await db.prepare("SELECT * FROM pages WHERE slug = ? AND active = 1").bind(pageMatch[1]).first();
      if (!p) return err("Page not found", 404);
      return json({ page: p });
    }
    if (route === "admin/pages" && method === "GET") {
      if (!(await requireModule(db, request, "pages"))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM pages ORDER BY id").all();
      return json({ pages: results });
    }
    if (route === "admin/pages" && method === "POST") {
      if (!(await requireModule(db, request, "pages"))) return err("Admin login required", 401);
      const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug || !body.title) return err("পেজের নাম ও লিংক (slug) দিন");
      const dup = await db.prepare("SELECT id FROM pages WHERE slug = ?").bind(slug).first();
      if (dup) return err("এই slug দিয়ে আগেই পেজ আছে");
      const r = await db.prepare("INSERT INTO pages (slug, title, content, active, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
        .bind(slug, String(body.title), String(body.content || ""), body.active === false ? 0 : 1).run();
      return json({ id: r.meta.last_row_id });
    }
    const aPageMatch = route.match(/^admin\/pages\/(\d+)$/);
    if (aPageMatch && method === "PUT") {
      if (!(await requireModule(db, request, "pages"))) return err("Admin login required", 401);
      await db.prepare("UPDATE pages SET title = ?, content = ?, active = ? WHERE id = ?")
        .bind(String(body.title || ""), String(body.content || ""), body.active === false ? 0 : 1, Number(aPageMatch[1])).run();
      return json({ ok: true });
    }
    if (aPageMatch && method === "DELETE") {
      if (!(await requireModule(db, request, "pages"))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM pages WHERE id = ?").bind(Number(aPageMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Staff accounts ---------- */
    if (route === "staff/login" && method === "POST") {
      const st = await db.prepare("SELECT * FROM staff WHERE username = ? AND active = 1").bind(String(body.username || "").trim()).first();
      if (!st) return err("স্টাফ অ্যাকাউন্ট পাওয়া যায়নি", 401);
      const hash = await hashWithSalt(String(body.password || ""), st.salt);
      if (hash !== st.pass_hash) return err("ভুল পাসওয়ার্ড", 401);
      return json({ token: await newSession(db, "staff", st.id), name: st.name, perms: parseJson(st.perms, []) });
    }
    if (route === "admin/staff" && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT id, name, username, perms, active, created_at FROM staff ORDER BY id").all();
      return json({ staff: results });
    }
    if (route === "admin/staff" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      if (!body.name || !body.username || !body.password) return err("নাম, ইউজারনেম ও পাসওয়ার্ড দিন");
      if (String(body.password).length < 4) return err("পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
      const dup = await db.prepare("SELECT id FROM staff WHERE username = ?").bind(String(body.username).trim()).first();
      if (dup) return err("এই ইউজারনেম আগেই আছে");
      const salt = randomHex(8);
      const hash = await hashWithSalt(String(body.password), salt);
      const perms = Array.isArray(body.perms) ? body.perms.filter((x) => ["banners", "products", "stock", "orders", "coupons", "users", "pages"].includes(x)) : [];
      const r = await db.prepare("INSERT INTO staff (name, username, pass_hash, salt, perms, active, created_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'))")
        .bind(String(body.name), String(body.username).trim(), hash, salt, JSON.stringify(perms)).run();
      return json({ id: r.meta.last_row_id });
    }
    const staffMatch = route.match(/^admin\/staff\/(\d+)$/);
    if (staffMatch && method === "PATCH") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const sid = Number(staffMatch[1]);
      if (body.active !== undefined) await db.prepare("UPDATE staff SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, sid).run();
      if (body.perms !== undefined) {
        const perms = Array.isArray(body.perms) ? body.perms.filter((x) => ["banners", "products", "stock", "orders", "coupons", "users", "pages"].includes(x)) : [];
        await db.prepare("UPDATE staff SET perms = ? WHERE id = ?").bind(JSON.stringify(perms), sid).run();
      }
      if (body.newPassword) {
        if (String(body.newPassword).length < 4) return err("পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
        const salt = randomHex(8);
        const hash = await hashWithSalt(String(body.newPassword), salt);
        await db.prepare("UPDATE staff SET pass_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, sid).run();
      }
      return json({ ok: true });
    }
    if (staffMatch && method === "DELETE") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM staff WHERE id = ?").bind(Number(staffMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Backups (auto weekly + manual, JSON download) ---------- */
    async function makeBackup(label) {
      const tables = ["settings", "products", "product_variants", "banners", "users", "coupons", "delivery_stock", "orders", "pages"];
      const dump = {};
      for (const t of tables) {
        try { const { results } = await db.prepare("SELECT * FROM " + t).all(); dump[t] = results; } catch (e) { dump[t] = []; }
      }
      // Never include password hashes/salts or the VAPID private key in a downloadable backup.
      dump.users = (dump.users || []).map((u) => ({ ...u, pass_hash: "", salt: "" }));
      dump.settings = (dump.settings || []).filter((s) => !["admin_hash", "admin_salt", "vapid_keys"].includes(s.key));
      const r = await db.prepare("INSERT INTO backups (label, data, created_at) VALUES (?, ?, datetime('now'))").bind(label, JSON.stringify(dump)).run();
      return r.meta.last_row_id;
    }
    if (route === "admin/backups" && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const latest = await db.prepare("SELECT id, created_at FROM backups ORDER BY id DESC LIMIT 1").first();
      if (!latest || (Date.now() - new Date(latest.created_at + "Z").getTime() > 7 * 86400000)) await makeBackup("auto");
      const { results } = await db.prepare("SELECT id, label, created_at, LENGTH(data) AS size FROM backups ORDER BY id DESC LIMIT 30").all();
      return json({ backups: results });
    }
    if (route === "admin/backups" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const id = await makeBackup("manual");
      return json({ ok: true, id });
    }
    const bkMatch = route.match(/^admin\/backups\/(\d+)$/);
    if (bkMatch && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const b = await db.prepare("SELECT * FROM backups WHERE id = ?").bind(Number(bkMatch[1])).first();
      if (!b) return err("Backup not found", 404);
      return json({ backup: b });
    }
    if (bkMatch && method === "DELETE") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM backups WHERE id = ?").bind(Number(bkMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Expiring subscriptions (admin reminder list) ---------- */
    if (route === "admin/expiring" && method === "GET") {
      if (!(await requireModule(db, request, "orders"))) return err("Admin login required", 401);
      const { results } = await db.prepare(
        "SELECT o.id, o.product_name, o.variant_label, o.customer_name, o.customer_mobile, o.expires_at, CAST(julianday(o.expires_at) - julianday('now') AS INTEGER) AS days_left FROM orders o WHERE o.status = 'Delivered' AND o.expires_at != '' AND julianday(o.expires_at) - julianday('now') <= 3 ORDER BY o.expires_at"
      ).all();
      return json({ expiring: results });
    }

    return err("Not found", 404);
  } catch (e) {
    return err("Server error: " + (e.message || e), 500);
  }
}
