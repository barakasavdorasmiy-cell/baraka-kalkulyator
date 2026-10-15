// Baraka Savdo — Muddatli to'lov kalkulyatori (bog'lanishsiz Node.js server, npm install shart emas)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3005;
const DATA_DIR = path.join(__dirname, 'data');
const CFG_FILE = path.join(DATA_DIR, 'config.json');
const INDEX = path.join(__dirname, 'public', 'index.html');

// ---------- parol ----------
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- sozlamalar ----------
function defaultConfig() {
  const base = baseConfig();
  // Bepul hostingda (fayllar o'chib ketadigan joyda) stavkalar RATES_JSON muhit o'zgaruvchisidan olinadi
  if (process.env.RATES_JSON) {
    try { Object.assign(base, validateConfig(JSON.parse(process.env.RATES_JSON))); }
    catch (e) { console.error('RATES_JSON noto\'g\'ri, standart stavkalar ishlatildi:', e.message); }
  }
  return base;
}
function baseConfig() {
  return {
    usdRate: 12000,        // doimiy dollar kursi
    usdMarkup: 0.05,       // dollar narxga 5% qo'shiladi
    terms: [               // noPrepay = oldindan to'lovsiz, withPrepay = oldindan to'lov bilan (qolgan summaga)
      { months: 3,  noPrepay: 0.15,  withPrepay: 0.099 },
      { months: 6,  noPrepay: 0.24,  withPrepay: 0.198 },
      { months: 12, noPrepay: 0.42,  withPrepay: 0.396 },
      { months: 18, noPrepay: 0.594, withPrepay: 0.54 },
    ],
    adminHash: hashPw(process.env.ADMIN_PASSWORD || 'baraka2026'),
  };
}
function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CFG_FILE)) saveConfig(defaultConfig());
  return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
}
function saveConfig(c) {
  const tmp = CFG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CFG_FILE);
}
let CFG = loadConfig();

// ---------- hisob-kitob (Excel formulalarining aynan nusxasi) ----------
const num = (v) => { const n = Number(String(v ?? '').replace(/[\s,]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const R = (x) => Math.round(x + 1e-9);

function calc(cfg, input, admin) {
  const uzs = num(input.priceUzs), usd = num(input.priceUsd);
  const pPct = Math.min(num(input.prepayPct), 100) / 100, pSum = num(input.prepaySum);
  const conflictPrice = uzs > 0 && usd > 0;
  const conflictPre = pPct > 0 && pSum > 0;

  let cost = 0;
  if (!conflictPrice && !conflictPre) cost = usd > 0 ? R(usd * (1 + cfg.usdMarkup) * cfg.usdRate) : uzs;

  const rawPre = pSum > 0 ? pSum : pPct * cost;
  const tooBig = cost > 0 && rawPre >= cost;
  const prepay = cost === 0 || tooBig ? 0 : R(rawPre);

  let warning = '';
  if (conflictPrice) warning = "Faqat bitta narx maydonini to'ldiring (so'm yoki dollar)";
  else if (conflictPre) warning = "Oldindan to'lovni faqat bittasini kiriting: foiz YOKI summa";
  else if (tooBig) warning = "Oldindan to'lov narxdan kam bo'lishi kerak";

  const remaining = cost - prepay;
  const rows = cfg.terms.map((t) => {
    const m = t.months;
    const monthly1 = cost ? R((cost * (1 + t.noPrepay)) / m) : 0;
    const total1 = monthly1 * m;
    const rate2 = prepay > 0 ? t.withPrepay : t.noPrepay;
    const monthly2 = cost ? R((remaining * (1 + rate2)) / m) : 0;
    const total2 = cost ? prepay + monthly2 * m : 0;
    const row = { months: m, monthly1, total1, monthly2, total2, saving: cost ? total1 - total2 : 0 };
    if (admin) {
      row.profit1 = cost ? total1 - cost : 0;
      row.profit1Pct = cost ? (total1 - cost) / cost : 0;
      row.profit1Usd = row.profit1 / cfg.usdRate;
      row.profit2 = cost ? total2 - cost : 0;
      row.profit2Pct = cost ? (total2 - cost) / cost : 0;
      row.profit2Usd = row.profit2 / cfg.usdRate;
    }
    return row;
  });

  const out = {
    warning, cost, prepay,
    prepayPct: cost ? prepay / cost : 0, // mijozga ko'rsatiladigan oldindan to'lov ulushi (foiz stavka emas)
    remaining, rows,
  };
  return out;
}

// ---------- sessiyalar va himoya ----------
const sessions = new Map(); // token -> expires
const TTL = 12 * 3600 * 1000;
const fails = new Map();    // ip -> {n, until}

function isAdmin(req) {
  const t = req.headers['x-admin-token'];
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function validateConfig(b) {
  const usdRate = Number(b.usdRate), usdMarkup = Number(b.usdMarkup);
  if (!(usdRate > 0) || !(usdMarkup >= 0 && usdMarkup < 1)) throw new Error("Dollar kursi yoki ustama noto'g'ri");
  if (!Array.isArray(b.terms) || b.terms.length < 1 || b.terms.length > 8) throw new Error("Muddatlar soni 1–8 bo'lishi kerak");
  const seen = new Set();
  const terms = b.terms.map((t) => {
    const months = Math.round(Number(t.months)), a = Number(t.noPrepay), c = Number(t.withPrepay);
    if (!(months >= 1 && months <= 60) || seen.has(months)) throw new Error("Muddat (oy) noto'g'ri yoki takrorlangan");
    if (!(a >= 0 && a <= 3) || !(c >= 0 && c <= 3)) throw new Error("Foiz 0 dan 300 gacha bo'lishi kerak");
    seen.add(months);
    return { months, noPrepay: a, withPrepay: c };
  }).sort((x, y) => x.months - y.months);
  return { usdRate, usdMarkup, terms };
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(INDEX));
    }
    if (req.method === 'POST' && url === '/api/calc') {
      return send(res, 200, calc(CFG, await readBody(req), isAdmin(req)));
    }
    if (req.method === 'POST' && url === '/api/login') {
      const ip = req.socket.remoteAddress;
      const f = fails.get(ip) || { n: 0, until: 0 };
      if (f.until > Date.now()) return send(res, 429, { error: "Ko'p urinish. Birozdan keyin qayta urinib ko'ring." });
      const { password } = await readBody(req);
      if (typeof password === 'string' && checkPw(password, CFG.adminHash)) {
        fails.delete(ip);
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, Date.now() + TTL);
        return send(res, 200, { token });
      }
      f.n += 1; if (f.n >= 5) { f.until = Date.now() + 5 * 60 * 1000; f.n = 0; }
      fails.set(ip, f);
      return send(res, 401, { error: "Parol noto'g'ri" });
    }
    if (url.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Kirish talab qilinadi' });
      if (req.method === 'GET' && url === '/api/admin/config') {
        const { usdRate, usdMarkup, terms } = CFG;
        return send(res, 200, { usdRate, usdMarkup, terms });
      }
      if (req.method === 'PUT' && url === '/api/admin/config') {
        const v = validateConfig(await readBody(req));
        CFG = { ...CFG, ...v }; saveConfig(CFG);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url === '/api/admin/password') {
        const { oldPassword, newPassword } = await readBody(req);
        if (!checkPw(String(oldPassword || ''), CFG.adminHash)) return send(res, 400, { error: "Eski parol noto'g'ri" });
        if (typeof newPassword !== 'string' || newPassword.length < 8) return send(res, 400, { error: "Yangi parol kamida 8 belgi bo'lsin" });
        CFG.adminHash = hashPw(newPassword); saveConfig(CFG);
        sessions.clear();
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'Topilmadi' });
  } catch (e) {
    send(res, 400, { error: e.message || 'Xato' });
  }
});
server.listen(PORT, () => console.log(`Baraka kalkulyator: http://localhost:${PORT}`));
