# —͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i — NEW PROJECT (Full Admin Control)

একদম নতুন করে বানানো সম্পূর্ণ ই-কমার্স সিস্টেম। প্রতিটা পেজ আলাদা, আর **পুরো সাইট Admin Panel থেকে নিয়ন্ত্রণ** করা যায় — কোডে হাত দেওয়ার দরকার নেই।

## পেজসমূহ (সব আলাদা ফাইল)
| ফাইল | কাজ |
|---|---|
| `index.html` | হোম / Shop — ব্যানার স্লাইডার, Featured, সব প্রোডাক্ট, সার্চ, ক্যাটাগরি |
| `product.html?id=…` | প্রতিটা প্রোডাক্টের আলাদা পেজ — ভার্সন/প্যাকেজ বাছাইসহ |
| `order.html` | Order পেজ — Admin-এর দেওয়া পেমেন্ট নম্বর (Copy বাটনসহ), TrxID, কুপন |
| `login.html` | কাস্টমার Login / Register |
| `dashboard.html` | **Customer Dashboard** — ওভারভিউ, My Orders (স্ট্যাটাস ধাপ), My Deliveries (লাইসেন্স/লিংক + Copy), Account Settings (নাম/পাসওয়ার্ড বদল) |
| `info.html` | পলিসি পেজ — লেখা Admin থেকে বদলানো যায় |
| `admin-x8362.html` | 🔒 **গোপন Admin পেজ** — সাইটের কোথাও লিংক নেই। মালিকের ঠিকানা: `https://dark-broken.pages.dev/admin-x8362.html` |
| `assets/style.css` / `assets/app.js` | শেয়ার করা ডিজাইন ও মেনু/হেডার/ফুটার |
| `functions/api/[[route]].js` | পুরো ব্যাকএন্ড API |
| `schema.sql` | ডাটাবেস (একবার Run) |

## Admin থেকে যা যা নিয়ন্ত্রণ করা যায়
- **Dashboard:** মোট আয়, অর্ডার সংখ্যা, Pending/Delivered, প্রোডাক্ট/কাস্টমার; স্টক কমে গেলে সতর্কতা
- **Banners:** হোম ব্যানার যোগ/Edit/Delete, ছবি আপলোড, চালু/বন্ধ, ক্রম
- **Products:** ছবি আপলোড, ভার্সন/প্যাকেজ (প্রতিটার আলাদা দাম), Featured করা
- **Delivery Stock:** লাইসেন্স কী/লিংক জমা — অর্ডার Confirm/Delivered হলেই অটো ডেলিভারি কাস্টমারের Dashboard-এ; স্টক না থাকলে Manual delivery ঘরে লিখে দেওয়া যায়
- **Orders:** স্ট্যাটাস বদল; **Coupons:** কোড তৈরি/Delete
- **Users:** সব কাস্টমার, তাদের অর্ডার/কেনাকাটা, Block/Unblock
- **Site Settings:** লোগো আপলোড, সাইটের নাম/ট্যাগলাইন, ঘোষণা বার, হোমের শিরোনাম, Featured সেকশন চালু/বন্ধ, Maintenance Mode, bKash/Nagad/Rocket নম্বর, WhatsApp নম্বর, পেমেন্ট নির্দেশনা, ডেলিভারি বার্তা, সব পলিসির লেখা

## 🚀 নতুন করে Live করার ধাপ
1. **GitHub:** নতুন repo বানান (নাম `dark-broken` দিলে আগের ঠিকানাই থাকবে) → এই ফোল্ডারের সব ফাইল/ফোল্ডার Upload → Commit। ফোল্ডার কাঠামো: রুটে সব HTML + `assets/` + `functions/api/[[route]].js` + `schema.sql`।
2. **D1:** Cloudflare → Storage & Databases → D1 → Create → নাম `dark-broken-db` → Console-এ `schema.sql`-এর পুরো লেখা paste → Execute।
3. **Pages:** Workers & Pages (নতুন ড্যাশবোর্ডে Compute) → Create → Pages → Connect to Git → নতুন repo → Framework: None, Build command: খালি, Output: `/` → Deploy।
4. **Binding:** Pages প্রজেক্ট → Settings → Bindings → Add → D1 database → Variable name হুবহু `DB` → database `dark-broken-db` → Save → Deployments থেকে **Retry deployment**।
5. **সেটআপ:** `https://dark-broken.pages.dev/admin-x8362.html` খুলে নতুন **Admin passcode** তৈরি করুন → তারপর Site Settings-এ গিয়ে পেমেন্ট নম্বর + WhatsApp নম্বর বসান → প্রথম প্রোডাক্ট + Delivery Stock যোগ করুন → নিজে রেজিস্টার করে একটা টেস্ট Order দিয়ে পুরো ফ্লো যাচাই করুন।

## নোট
- **`wrangler.toml` repo-তে রাখবেন না** — থাকলে ড্যাশবোর্ডে Bindings লক হয়ে যায়।
- গোপন Admin লিংকটা বুকমার্ক করে রাখুন, কাউকে দেবেন না; তার উপরেও passcode লাগে।
- Maintenance Mode Admin দিয়ে আটকে গেলে: গোপন Admin লিংকে গিয়ে passcode দিয়ে ঢুকে Mode বন্ধ করুন (Admin নিজে Maintenance-এ আটকায় না)।
- ডিজাইন: Deep Black (#000003) & Electric Blue (#2742F5 / #0766D9), নীল নিয়ন গ্লো + গ্লাস ইফেক্ট; নাম Black Mustang ফন্টে; বাকি সব Poppins।

## 🎨 থিম ও গোপন এন্ট্রি (সর্বশেষ স্পেসিফিকেশন)
- থিম: ব্যাকগ্রাউন্ড #000003, অ্যাকসেন্ট Electric Blue #2742F5/#0766D9, কার্ড/বাটনে নীল গ্লো, গ্লাস-ব্লার হেডার ও পপআপ।
- মেনু: Home / My Purchases / Login — Admin-এর কোনো লিংক নেই।
- **গোপন Admin এন্ট্রি:** সাইটের যেকোনো পেজে কীবোর্ডে **Ctrl + Shift + A** চাপলে passcode পপআপ আসবে — সঠিক passcode দিলেই Admin প্যানেল খুলবে। (মোবাইলের জন্য গোপন লিংক `admin-x8362.html` তো আছেই।) Admin passcode প্রথমবার গোপন পেজে গিয়ে নিজে সেট করতে হয় — সেটাই পরে সব জায়গায় লাগবে।
- Admin Orders-এ **Approve & Send Key** বাটন: ক্লিক করলেই অর্ডার Completed হয়ে স্টক থেকে লাইসেন্স কী কাস্টমারের Dashboard-এর টেবিলে চলে যায়।
- Customer Dashboard-এ স্ট্যাটাস দেখায় **Processing / Completed** নামে।
