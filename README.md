# Ouderschap & Co — React + Vite

Dit project is volledig omgezet naar **pure React + Vite** met **`.jsx` en `.js`** bestanden.

## Wat is er aangepast:
1. **Pure React + Vite SPA**:
   - Geen SSR, Nitro of Cloudflare worker overhead meer.
   - Alle `.tsx` bestanden zijn geconverteerd naar `.jsx`.
   - Alle `.ts` bestanden zijn geconverteerd naar `.js`.
   - Geen TypeScript compiler dependencies meer nodig.
2. **Volledige functionaliteit behouden**:
   - Alle ~50 routes (`/agenda`, `/kinderen/:kindId`, `/berichten`, `/kosten`, etc.) zijn 100% behouden.
   - Alle formulieren, dialogen, tabbladen en winkels/stores werken identiek.
   - Client-safe `server-fn.js` vervangt `@tanstack/react-start` voor AI functies zonder te crashen.
3. **Tailwind CSS v4** geïntegreerd via `@tailwindcss/vite`.

## Starten van de app

### 1. Installatie van dependencies
```bash
npm install
```

### 2. Ontwikkelserver starten
```bash
npm run dev
```

### 3. Productie build maken
```bash
npm run build
```

De geoptimaliseerde statische bestanden worden opgebouwd in de map `dist/`.
