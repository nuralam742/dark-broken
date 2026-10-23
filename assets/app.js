/* —͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i (NEW) — shared helpers; site look/text come from Admin settings */
const store = (() => {
  const mem = {};
  const ok = (() => { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; } })();
  return {
    get(k) { try { return ok ? localStorage.getItem(k) : (mem[k] ?? null); } catch (e) { return mem[k] ?? null; } },
    set(k, v) { try { ok ? localStorage.setItem(k, v) : (mem[k] = v); } catch (e) { mem[k] = v; } },
    del(k) { try { ok ? localStorage.removeItem(k) : delete mem[k]; } catch (e) { delete mem[k]; } },
  };
})();
const TK = "db_token", ATK = "db_admin_token";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "৳" + Number(n || 0).toLocaleString("en-IN");
let SITE = null;

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const t = opts.admin ? store.get(ATK) : store.get(TK);
  if (t) headers.Authorization = "Bearer " + t;
  const res = await fetch("/api/" + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "কিছু ভুল হয়েছে");
  return data;
}
async function loadSite() {
  if (SITE) return SITE;
  try { const d = await api("settings"); SITE = d.site || {}; } catch (e) { SITE = {}; }
  return SITE;
}

const WA_SVG = '<svg viewBox="0 0 32 32"><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.4.8 4.6 2 6.4L4 29l7.9-2c1.7.9 3.6 1.4 5.6 1.4h.1c6.6 0 12-5.3 12-11.9C28 8.3 22.6 3 16 3zm0 21.8h-.1c-1.7 0-3.4-.5-4.9-1.3l-.3-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-10 10.1-10 2.7 0 5.2 1 7.1 2.9 1.9 1.9 2.9 4.4 2.9 7.1-.1 5.5-4.6 9.9-10.4 9.9zm5.7-7.4c-.3-.2-1.9-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.7 2.1-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4z"/></svg>';

async function renderChrome(active) {
  initSecretAdminEntry();
  const site = await loadSite();
  const isAdminPage = location.pathname.includes("admin-x8362");
  if (site.maintenance && !isAdminPage && !store.get(ATK)) {
    document.body.innerHTML = `<div class="maint"><div class="big">🛠️</div><h1 style="margin:14px 0 8px">${esc(site.siteName || "—͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i")}</h1><p class="sub" style="font-size:16px">${esc(site.maintenanceText || "সাইটে আপডেটের কাজ চলছে")}</p></div>`;
    return site;
  }
  const loggedIn = !!store.get(TK);
  const page = (p) => (active === p ? ' class="active"' : "");
  const logo = site.logoUrl
    ? `<img class="logoimg" src="${esc(site.logoUrl)}" alt="logo">`
    : "";
  const nameHtml = esc(site.siteName || "—͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i");
  const announce = site.announcementOn && site.announcement
    ? `<div class="announce"><span class="marq">${esc(site.announcement)}</span></div>` : "";
  document.body.insertAdjacentHTML("afterbegin", `
  ${announce}
  <header><div class="wrap nav">
    <a class="logo" href="index.html">${logo}${nameHtml}</a>
    <span class="tagline">${esc(site.tagline || "")}</span>
    <nav class="nav-links">
      <a href="index.html"${page("shop")}>Home</a>
      <a href="track.html"${page("track")}>Track Order</a>
      ${loggedIn ? `<a href="dashboard.html"${page("dashboard")}>My Purchases</a>` : `<a href="login.html"${page("login")}>Login</a>`}
    </nav>
  </div></header>`);
  document.body.insertAdjacentHTML("beforeend", `
  <footer><div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="foot-brand">${nameHtml}</div>
        <p>${esc(site.tagline || "Premium Software & Tools — Bangladesh")}</p>
        <p class="foot-pay">bKash · Nagad · Rocket</p>
      </div>
      <div>
        <h5>Quick Links</h5>
        <a href="index.html">Home</a>
        <a href="dashboard.html">My Purchases</a>
        <a href="track.html">Track Order</a>
        <a href="login.html">Login</a>
        <span id="customPages"></span>
      </div>
      <div>
        <h5>Policies</h5>
        <a href="info.html#p-delivery">Delivery Policy</a>
        <a href="info.html#p-refund">Refund Policy</a>
        <a href="info.html#p-privacy">Privacy Policy</a>
        <a href="info.html#p-terms">Terms &amp; Conditions</a>
      </div>
      <div>
        <h5>Support</h5>
        <a href="info.html#p-about">About &amp; Contact</a>
        <a href="info.html#p-delivery">How Delivery Works</a>
      </div>
    </div>
    <div class="foot-bottom">© 2026 ${nameHtml} — All rights reserved.</div>
  </div></footer>`);
  const num = String(site.whatsapp || "").replace(/\D/g, "");
  if (num) {
    const intl = num.startsWith("0") ? "880" + num.slice(1) : num;
    document.body.insertAdjacentHTML("beforeend",
      `<a class="wa-float" target="_blank" rel="noopener" href="https://wa.me/${intl}" title="WhatsApp-এ মেসেজ করুন">${WA_SVG}</a>`);
  }
  // Custom pages (built from the admin panel) appear in the footer.
  try {
    const pg = await api("pages");
    const box = document.getElementById("customPages");
    if (box && pg.pages && pg.pages.length) box.innerHTML = pg.pages.map((p) => `<a href="page.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`).join("");
  } catch (e) {}
  maybeShowPopup(site);
  registerSW();
  return site;
}

/* ---------- Offer popup (once per day) ---------- */
function maybeShowPopup(site) {
  if (!site.popupOn || !site.popupTitle) return;
  if (location.pathname.includes("admin-x8362")) return;
  const key = "db_popup_day";
  const today = new Date().toISOString().slice(0, 10);
  if (store.get(key) === today) return;
  setTimeout(() => {
    if (document.querySelector(".promo-modal")) return;
    const wrap = document.createElement("div");
    wrap.className = "promo-modal";
    wrap.innerHTML = `<div class="promo-box">
      ${site.popupImage ? `<img src="${esc(site.popupImage)}" alt="">` : ""}
      <div class="pb">
        <h3>${esc(site.popupTitle)}</h3>
        ${site.popupText ? `<p class="sub" style="font-size:14px;line-height:1.65">${esc(site.popupText)}</p>` : ""}
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
          ${site.popupLink ? `<a class="btn" href="${esc(site.popupLink)}">${esc(site.popupBtn || "অফারটি দেখুন")}</a>` : ""}
          <button class="btn ghost" type="button" id="promoClose">পরে দেখব</button>
        </div>
      </div></div>`;
    document.body.appendChild(wrap);
    const close = () => { store.set(key, today); wrap.remove(); };
    wrap.querySelector("#promoClose").addEventListener("click", close);
    wrap.addEventListener("click", (ev) => { if (ev.target === wrap) close(); });
  }, 900);
}

/* ---------- Web Push ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
function urlB64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("এই ব্রাউজারে Push Notification সাপোর্ট নেই");
  const key = await api("push/key");
  if (!key.publicKey) throw new Error("Push এখনো চালু হয়নি — Admin সেটআপ বাকি");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification-এর অনুমতি দেওয়া হয়নি");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key.publicKey) });
  await api("push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return true;
}

/* ---------- Shared delivery renderer + gallery helper ---------- */
function allImages(p) {
  const arr = [];
  if (p.image_url) arr.push(p.image_url);
  for (const im of p.images || []) if (im && !arr.includes(im)) arr.push(im);
  return arr;
}
window.copyKey = async (btn) => {
  const span = btn.parentElement.querySelector("span");
  const text = span ? span.textContent : "";
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = "Copy"), 1500); } catch (e) {}
};
function deliveryHtml(content) {
  if (!content) return '<span class="sub">প্রসেসিং চলছে</span>';
  if (content.startsWith("FILE::")) {
    const rest = content.slice(6);
    const idx = rest.indexOf("::");
    const name = idx >= 0 ? rest.slice(0, idx) : "download";
    const data = idx >= 0 ? rest.slice(idx + 2) : "";
    return `<div class="keybox"><span>📥 ${esc(name)}</span><a class="btn sm" href="${data}" download="${esc(name)}">Download</a></div>`;
  }
  if (/^https?:\/\//i.test(content)) {
    return `<div class="keybox"><span>${esc(content)}</span><a class="btn sm ghost" href="${esc(content)}" target="_blank" rel="noopener">Open</a><button class="btn sm ghost" type="button" onclick="copyKey(this)">Copy</button></div>`;
  }
  return `<div class="keybox"><span>${esc(content)}</span><button class="btn sm ghost" type="button" onclick="copyKey(this)">Copy</button></div>`;
}

function statusLabel(s) {
  if (s === "Delivered") return "Completed";
  if (s === "Cancelled") return "Cancelled";
  return "Processing"; // Pending / Confirmed
}

/* Secret admin entry: Ctrl+Shift+A opens a passcode popup (owner only). */
function initSecretAdminEntry() {
  if (location.pathname.includes("admin-x8362")) return;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      if (document.querySelector(".admin-modal")) return;
      const wrap = document.createElement("div");
      wrap.className = "admin-modal";
      wrap.innerHTML = `<div class="box">
        <h3 style="font-size:18px">Admin Access</h3>
        <p class="sub" style="margin:6px 0 4px">Admin passcode দিন</p>
        <form id="secretAdminForm">
          <input id="secretAdminPass" type="password" placeholder="Passcode" autocomplete="off">
          <button class="btn" style="width:100%;margin-top:14px" type="submit">Enter Panel</button>
          <div class="msg" id="secretAdminMsg"></div>
        </form>
        <button class="btn ghost sm" id="secretAdminClose" style="margin-top:6px">বন্ধ করুন</button>
      </div>`;
      document.body.appendChild(wrap);
      wrap.querySelector("#secretAdminPass").focus();
      const close = () => wrap.remove();
      wrap.querySelector("#secretAdminClose").addEventListener("click", close);
      wrap.addEventListener("click", (ev) => { if (ev.target === wrap) close(); });
      wrap.querySelector("#secretAdminForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const m = wrap.querySelector("#secretAdminMsg");
        try {
          const s = await api("admin/status");
          if (!s.setup) { m.className = "msg err"; m.textContent = "Admin passcode এখনো সেট হয়নি — গোপন লিংক থেকে প্রথমবার সেট করুন"; return; }
          const d = await api("admin/login", { method: "POST", body: JSON.stringify({ passcode: wrap.querySelector("#secretAdminPass").value }) });
          store.set(ATK, d.token);
          location.href = "admin-x8362.html";
        } catch (err) { m.className = "msg err"; m.textContent = err.message; }
      });
    }
  });
}

function productImg(p, cls) {
  return p.image_url ? `<img class="${cls || ""}" src="${esc(p.image_url)}" alt="${esc(p.name)}">` : `<div class="ph"></div>`;
}
function offPct(price, oldPrice) {
  return oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
}
function basePrice(p) {
  if (p.variants && p.variants.length) return Math.min(...p.variants.map((v) => v.price));
  return p.price;
}
function stockTotal(p) {
  return (p.stock || []).reduce((s, x) => s + Number(x.n || 0), 0);
}
async function fileToDataUrl(input, max = 1000, quality = 0.82) {
  const f = input.files && input.files[0];
  if (!f) return null;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(f);
  });
}
