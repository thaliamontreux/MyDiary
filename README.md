# My Secret Diary

A beautiful local diary app with a soft SVG background and strong modern encryption.

## Security model

- Password-derived key: **Argon2id** (via libsodium)
- Encryption: **XChaCha20-Poly1305** (authenticated encryption)
- Storage: encrypted vault stored in `localStorage`

If you forget your password, the diary cannot be recovered.

## Run

1. Install dependencies

   - `npm install`

2. Start dev server

   - `npm run dev`

3. Open the URL Vite prints (usually http://localhost:5173)
# MyDiary
