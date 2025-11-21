Sealed Pokémon Portfolio (Local Web App)

Overview
- Track sealed Pokémon products locally in your browser.
- Add products with name, language, quantity, price paid, optional market price, notes, and an image.
- See totals for items, invested amount, estimated value, and profit/loss.
- Data is stored locally in your browser (localStorage). You can import/export JSON backups.

Quick Start
1. Open `index.html` in your browser (double click on Windows).
2. Use the “Add / Edit Product” form to add your items.
3. Use Export to save a JSON backup. Use Import to restore.

Features
- Add, edit, delete products.
- Image upload with local compression to reduce storage.
- Search across name, series, language, and notes.
- Currency selector (EUR, USD, GBP, CHF). Defaults to EUR.
- Portfolio summary and P/L.
- Import/Export as JSON.

Notes and Limits
- Images are compressed to JPEG at ~0.8 quality and max ~900px. This helps keep data below browser localStorage limits (~5–10MB depending on browser).
- If you plan to store many high-resolution images, consider keeping images on disk and using links, or we can migrate storage to IndexedDB in a future version.

Future: Cardmarket Integration
- Market prices can be fetched from Cardmarket’s API (requires credentials).
- A browser app usually cannot call their API directly due to CORS and credential handling. Recommended approach is a small backend proxy (Node/Express) that:
  - Stores API credentials safely on the server.
  - Exposes a secure endpoint to the web app for price lookups.
  - Normalizes price data in EUR and returns it to the frontend.
- When you are ready, we can scaffold this backend and wire up automatic market price refresh per product (by product name or specific Cardmarket IDs).

Privacy
- All data stays on your computer unless you export the JSON.

Development
- This project is plain HTML/CSS/JS; there is no build step.
- Open `index.html` to run. It will call the hosted proxy on Render at `https://seald-server.onrender.com` for Cardmarket prices. If you want to use a local proxy during development, launch it and add `?api=local` to the page URL (or `?apiBase=http://localhost:3000` for a custom base).

Backend Proxy (RapidAPI)
- A small proxy is included under `SealD-Server/` to hide your API key and avoid CORS issues.
  - Copy `server/.env.example` to `server/.env` and set `RAPIDAPI_KEY` (do NOT commit your real key).
  - Adjust `API_BASE`, `RAPIDAPI_HOST`, and the endpoint paths to match your API (e.g., sealed products search).
  - Install and run:
    - `cd server`
    - `npm install`
    - `npm run dev` (or `npm start`)
  - Test: open `http://localhost:3000/api/status` then `http://localhost:3000/api/episodes`.
  - Once you confirm the correct products endpoint, update `PRODUCTS_PATH` in `.env` and we’ll wire the frontend type‑ahead.

Security
- Never hardcode or commit API keys. Use `server/.env` (local only) and keep `.env` out of version control.
