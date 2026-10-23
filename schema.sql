-- —͞Dᴀʀᴋ Bʀᴏᴋᴇɴ !i — NEW PROJECT — database schema (Cloudflare D1)
-- Run ONCE in D1 Console when creating the fresh database.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  old_price INTEGER,
  category TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  price INTEGER NOT NULL,
  old_price INTEGER
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '',
  subtitle TEXT DEFAULT '',
  button_text TEXT DEFAULT '',
  button_link TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS delivery_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  variant_id INTEGER,
  variant_label TEXT DEFAULT '',
  price INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  coupon_code TEXT DEFAULT '',
  payment_method TEXT NOT NULL,
  payment_number TEXT NOT NULL,
  trx_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  delivery_content TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT
);
