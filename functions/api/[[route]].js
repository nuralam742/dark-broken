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
async function attachVariants(db, products) {
  const { results: vars } = await db.prepare("SELECT * FROM product_variants ORDER BY id").all();
  for (const p of products) {
    p.variants = vars.filter((v) => v.product_id === p.id);
    const { results: st } = await db.prepare(
      "SELECT variant_id, COUNT(*) AS n FROM delivery_stock WHERE product_id = ? AND status='available' GROUP BY variant_id"
    ).bind(p.id).all();
    p.stock = st;
  }
  return products;
}
async function maybeDeliver(db, order) {
  // Auto-delivery: when an order becomes Confirmed/Delivered, assign one stock item.
  if (!["Confirmed", "Delivered"].includes(order.status)) return order;
  if (order.delivery_content) return order;
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
  if (!item) return order; // stock empty — admin delivers manually
  await db.prepare("UPDATE delivery_stock SET status='assigned', order_id = ? WHERE id = ?").bind(order.id, item.id).run();
  await db.prepare("UPDATE orders SET delivery_content = ? WHERE id = ?").bind(item.content, order.id).run();
  order.delivery_content = item.content;
  return order;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const db = env.DB;
  if (!db) return err("Database not connected. Bind your D1 database as DB in Cloudflare Pages settings.", 500);
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
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM banners ORDER BY sort, id").all();
      return json({ banners: results });
    }
    if (route === "admin/banners" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const r = await db.prepare(
        "INSERT INTO banners (title, subtitle, button_text, button_link, image_url, active, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(body.title || "", body.subtitle || "", body.buttonText || "", body.buttonLink || "", body.imageUrl || "", body.active === false ? 0 : 1, Number(body.sort) || 0).run();
      return json({ id: r.meta.last_row_id });
    }
    const bannerMatch = route.match(/^admin\/banners\/(\d+)$/);
    if (bannerMatch && method === "PUT") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      await db.prepare("UPDATE banners SET title=?, subtitle=?, button_text=?, button_link=?, image_url=?, active=?, sort=? WHERE id=?")
        .bind(body.title || "", body.subtitle || "", body.buttonText || "", body.buttonLink || "", body.imageUrl || "", body.active === false ? 0 : 1, Number(body.sort) || 0, Number(bannerMatch[1])).run();
      return json({ ok: true });
    }
    if (bannerMatch && method === "DELETE") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
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
        await db.prepare("INSERT INTO product_variants (product_id, label, price, old_price) VALUES (?, ?, ?, ?)")
          .bind(productId, v.label, Number(v.price), v.oldPrice ?? null).run();
      }
    }
    if (route === "products" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      if (!body.name || !body.price) return err("Name and price required");
      const r = await db.prepare(
        "INSERT INTO products (name, description, price, old_price, category, image_url, featured, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(body.name, body.description || "", Number(body.price), body.oldPrice ?? null, body.category || "", body.imageUrl || "", body.featured ? 1 : 0).run();
      await saveVariants(r.meta.last_row_id, body.variants);
      return json({ id: r.meta.last_row_id });
    }
    const prodMatch = route.match(/^products\/(\d+)$/);
    if (prodMatch && (method === "PUT" || method === "DELETE")) {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const id = Number(prodMatch[1]);
      if (method === "DELETE") {
        await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
        await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id).run();
        return json({ ok: true });
      }
      await db.prepare("UPDATE products SET name=?, description=?, price=?, old_price=?, category=?, image_url=?, featured=? WHERE id=?")
        .bind(body.name, body.description || "", Number(body.price), body.oldPrice ?? null, body.category || "", body.imageUrl || "", body.featured ? 1 : 0, id).run();
      await saveVariants(id, body.variants);
      return json({ ok: true });
    }

    /* ---------- Delivery stock (admin) ---------- */
    if (route === "admin/stock" && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const pid = Number(url.searchParams.get("productId"));
      const q = pid
        ? db.prepare("SELECT * FROM delivery_stock WHERE product_id = ? ORDER BY id DESC").bind(pid)
        : db.prepare("SELECT * FROM delivery_stock ORDER BY id DESC LIMIT 200");
      const { results } = await q.all();
      return json({ stock: results });
    }
    if (route === "admin/stock" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
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
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
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
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
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
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const { results } = await db.prepare(
        "SELECT u.id, u.name, u.mobile, u.blocked, u.created_at, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.price - COALESCE(o.discount,0) ELSE 0 END),0) AS spent FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id ORDER BY u.id DESC"
      ).all();
      return json({ users: results });
    }
    const userMatch = route.match(/^admin\/users\/(\d+)$/);
    if (userMatch && method === "PATCH") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      await db.prepare("UPDATE users SET blocked = ? WHERE id = ?").bind(body.blocked ? 1 : 0, Number(userMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- Coupons ---------- */
    if (route === "coupons/validate" && method === "GET") {
      const code = (url.searchParams.get("code") || "").trim().toUpperCase();
      const price = Number(url.searchParams.get("price"));
      if (!code || !price) return err("Coupon code দিন");
      const coupon = await db.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1").bind(code).first();
      if (!coupon) return err("এই কুপন কোডটি সঠিক নয় বা বন্ধ আছে");
      const discount = couponDiscount(coupon, price);
      return json({ code, discount, payable: price - discount });
    }
    if (route === "admin/coupons" && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM coupons ORDER BY id DESC").all();
      return json({ coupons: results });
    }
    if (route === "admin/coupons" && method === "POST") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const code = String(body.code || "").trim().toUpperCase();
      const type = body.discountType === "flat" ? "flat" : "percent";
      const value = Number(body.discountValue);
      if (!code || !value || value <= 0) return err("কুপন কোড আর সঠিক discount মান দিন");
      if (type === "percent" && value > 100) return err("Percent discount 100-এর বেশি হতে পারে না");
      const exists = await db.prepare("SELECT id FROM coupons WHERE code = ?").bind(code).first();
      if (exists) return err("এই কোড দিয়ে আগেই কুপন আছে");
      const r = await db.prepare("INSERT INTO coupons (code, discount_type, discount_value, active, created_at) VALUES (?, ?, ?, 1, datetime('now'))")
        .bind(code, type, value).run();
      return json({ id: r.meta.last_row_id });
    }
    const couponMatch = route.match(/^admin\/coupons\/(\d+)$/);
    if (couponMatch && method === "DELETE") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      await db.prepare("DELETE FROM coupons WHERE id = ?").bind(Number(couponMatch[1])).run();
      return json({ ok: true });
    }

    /* ---------- User auth ---------- */
    if (route === "auth/register" && method === "POST") {
      const { name, mobile, password } = body;
      if (!name || !mobile || !password) return err("নাম, মোবাইল আর পাসওয়ার্ড আবশ্যক");
      if (!/^01\d{9}$/.test(String(mobile))) return err("সঠিক 11 ডিজিটের মোবাইল নম্বর দিন (01...)");
      if (String(password).length < 4) return err("পাসওয়ার্ড কমপক্ষে 4 অক্ষরের হতে হবে");
      const exists = await db.prepare("SELECT id FROM users WHERE mobile = ?").bind(mobile).first();
      if (exists) return err("এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে — Login করুন");
      const salt = randomHex(8);
      const hash = await hashWithSalt(String(password), salt);
      const r = await db.prepare("INSERT INTO users (name, mobile, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
        .bind(name, mobile, hash, salt).run();
      return json({ token: await newSession(db, "user", r.meta.last_row_id), name });
    }
    if (route === "auth/login" && method === "POST") {
      const user = await db.prepare("SELECT * FROM users WHERE mobile = ?").bind(body.mobile || "").first();
      if (!user) return err("এই নম্বরে কোনো অ্যাকাউন্ট নেই — আগে Register করুন", 401);
      const hash = await hashWithSalt(String(body.password || ""), user.salt);
      if (hash !== user.pass_hash) return err("ভুল পাসওয়ার্ড", 401);
      if (user.blocked) return err("আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে — সাপোর্টে যোগাযোগ করুন", 403);
      return json({ token: await newSession(db, "user", user.id), name: user.name });
    }

    /* ---------- Me (customer dashboard) ---------- */
    if (route === "me" && method === "GET") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      return json({ user: { id: u.id, name: u.name, mobile: u.mobile, blocked: u.blocked, created_at: u.created_at } });
    }
    if (route === "me" && method === "PATCH") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      if (!body.name || !String(body.name).trim()) return err("নাম দিন");
      await db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(String(body.name).trim(), u.id).run();
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
      let price = product.price, variantId = null, variantLabel = "";
      if (body.variantId) {
        const v = await db.prepare("SELECT * FROM product_variants WHERE id = ? AND product_id = ?").bind(Number(body.variantId), product.id).first();
        if (!v) return err("Variant not found", 404);
        price = v.price; variantId = v.id; variantLabel = v.label;
      }
      if (!body.customerName || !body.customerMobile) return err("নাম আর মোবাইল নম্বর দিন");
      if (!["bKash", "Nagad", "Rocket"].includes(body.paymentMethod)) return err("পেমেন্ট মেথড বেছে নিন");
      if (!body.paymentNumber || !body.trxId) return err("পেমেন্ট নম্বর আর TrxID দিন");
      let discount = 0, couponCode = "";
      if (body.couponCode) {
        const coupon = await db.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1")
          .bind(String(body.couponCode).trim().toUpperCase()).first();
        if (!coupon) return err("কুপন কোডটি সঠিক নয়");
        discount = couponDiscount(coupon, price);
        couponCode = coupon.code;
      }
      const r = await db.prepare(
        `INSERT INTO orders (user_id, product_id, product_name, variant_id, variant_label, price, discount, coupon_code, payment_method, payment_number, trx_id, customer_name, customer_mobile, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', datetime('now'))`
      ).bind(u.id, product.id, product.name, variantId, variantLabel, price, discount, couponCode, body.paymentMethod, body.paymentNumber, body.trxId, body.customerName, body.customerMobile).run();
      return json({ orderId: r.meta.last_row_id, discount, payable: price - discount });
    }
    if (route === "my/orders" && method === "GET") {
      const u = await requireUser(db, request);
      if (!u) return err("Login required", 401);
      const { results } = await db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").bind(u.id).all();
      return json({ orders: results });
    }
    if (route === "admin/orders" && method === "GET") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
      const { results } = await db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
      return json({ orders: results });
    }
    const ordMatch = route.match(/^admin\/orders\/(\d+)$/);
    if (ordMatch && method === "PATCH") {
      if (!(await requireAdmin(db, request))) return err("Admin login required", 401);
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

    return err("Not found", 404);
  } catch (e) {
    return err("Server error: " + (e.message || e), 500);
  }
}
