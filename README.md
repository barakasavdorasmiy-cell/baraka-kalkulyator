# Baraka Savdo — Muddatli to'lov kalkulyatori (web)

Hisob-kitob **serverda** bajariladi. Mijoz brauzeriga faqat tayyor natija (oylik to'lov, jami, tejash) boradi —
foiz stavkalar, formulalar va foyda hech qachon mijozga yuborilmaydi (sahifa kodini ochib ham ko'rib bo'lmaydi).

## Ishga tushirish (kompyuterda sinash)
1. Node.js o'rnating (https://nodejs.org, LTS versiya).
2. Papkani oching va buyruq qatorida:  `node server.js`
3. Brauzerda oching: http://localhost:3005

Hech qanday `npm install` kerak emas.

## Admin
- Sahifa yuqorisidagi **Admin** tugmasi → parol kiriting. Boshlang'ich parol: `baraka2026`
  (**birinchi kirishdayoq almashtiring**: admin panel pastida "Parolni almashtirish").
- Admin kirgach: jadvallarda **foyda (so'm, %, $)** ustunlari ko'rinadi va pastda stavkalar paneli ochiladi:
  dollar kursi, dollar ustamasi (5%), har muddat uchun "oldindan to'lovsiz" va "oldindan to'lov bilan" jami foiz.
  Muddat (oy) ni ham o'zgartirish/boshqa qiymat qo'yish mumkin (masalan 9 oy).
- Mijoz oynasida Admin tugmasi kichik; parolsiz hech narsa ochilmaydi. 5 marta noto'g'ri parol — 5 daqiqa bloklanadi.
- Stavkalar `data/config.json` faylida saqlanadi (serverni o'chirib yoqsangiz ham qoladi). Zaxira nusxa olib qo'ying.
- Parolni unutsangiz: `data/config.json` faylini o'chiring va serverni qayta yoqing — standart stavkalar va parol
  `baraka2026` tiklanadi (yoki `ADMIN_PASSWORD=yangi_parol node server.js`).

## Haqiqiy serverga qo'yish (mijozlar ochishi uchun)
Variantlar (qaysi biri qulay bo'lsa):
1. **Algenix/o'z serveringiz (VPS, Ubuntu)**: papkani yuklang, `node server.js` ni doimiy ishlatish uchun `pm2 start server.js --name baraka`.
   Domen + HTTPS uchun Nginx yoki Caddy orqali 3000-portga yo'naltiring. HTTPS shart (admin paroli ochiq uzatilmasligi uchun).
2. **Render.com / Railway / Fly.io**: papkani GitHub'ga yuklang → "New Web Service" → Start command: `node server.js`.
   Muhim: `data/` papkasi doimiy diskda (Persistent Disk/Volume) turishi kerak, aks holda qayta yoqilganda stavkalar tiklanib qoladi.

## Fayllar
- `server.js` — server + hisob-kitob + admin API
- `public/index.html` — mijoz sahifasi va admin panel
- `data/config.json` — stavkalar (birinchi ishga tushganda o'zi yaratiladi)
