// L'app con un feed finto: i mezzi compaiono ancora?
//
// Serve a distinguere due cose che sulla mappa si somigliano: "il feed non
// manda niente" e "l'abbiamo rotta noi". Nessun altro controllo del progetto
// lo fa — build e verify guardano tipi e dati, non l'app in esecuzione — e il
// feed vero non è raggiungibile da ogni ambiente.
//
// Ha già ripagato il costo: ha scoperto che le corse non accertate venivano
// calcolate **dopo** l'uscita anticipata sul feed vuoto, quindi non comparivano
// proprio nel caso per cui esistono.
//
//   node scripts/smoke-map.mjs [url] [--feed-vuoto]
//
// Richiede Playwright e un server che serva la build:
//   npx vite preview --port 4173 --host 127.0.0.1
//
// Le tile OpenStreetMap falliscono senza rete: sono escluse dal conteggio
// errori di proposito, perché non dicono nulla sull'app.
import fs from 'node:fs';

// Playwright non è una dipendenza del progetto: servirebbe a un solo script e
// farebbe scaricare un browser a ogni installazione, CI compresa. Chi vuole
// questo controllo lo installa quando gli serve.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright non è installato. Per eseguire questo controllo:');
  console.error('  npm i --no-save playwright');
  console.error('  npx vite preview --port 4173 --host 127.0.0.1');
  console.error('  npm run smoke:map');
  process.exit(2);
}

const base = process.argv[2] ?? 'http://127.0.0.1:4173/BusRadar/';
const network = JSON.parse(fs.readFileSync('public/assets/gtfs-network.json', 'utf8'));

// Due mezzi veri, messi sulla prima fermata di due varianti reali.
const emptyFeed = process.argv.includes('--feed-vuoto');
const chosen = emptyFeed ? [] : network.routes.slice(0, 2);
const stopById = new Map(network.stops.map((stop) => [stop.id, stop]));
const now = Math.floor(Date.now() / 1000);
const vehicles = chosen.map((route, index) => {
  const stop = stopById.get(route.stopEntries[Math.floor(route.stopEntries.length / 2)].stopId);
  return {
    entityId: `e${index}`,
    routeId: route.routeId,
    vehicleId: `${9000 + index}`,
    vehicleLabel: `${9000 + index}`,
    tripId: `t${index}`,
    lat: stop.lat,
    lon: stop.lon,
    bearing: 90,
    speed: 8,
    timestamp: String(now - 5),
  };
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 200));
});
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));

await page.route('**/gtt-realtime/vehicles', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', entityCount: vehicles.length, vehiclePositionCount: vehicles.length, header: { timestamp: now }, vehicles }),
  }),
);
await page.route('**/gtt-realtime/trips', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', tripUpdates: [] }) }),
);

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

// Quanto resta bloccato il thread principale: un refresh che macina per secondi
// si vede come mappa ferma, non come errore.
const blocked = await page.evaluate(async () => {
  const samples = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let frames = 0;
    function tick() {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      frames += 1;
      if (frames < 120) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  return Math.round(Math.max(...samples));
});

await page.getByRole('button', { name: 'Vetture' }).click().catch(() => page.click('text=Vetture'));
await page.waitForTimeout(2500);
const bodyText = await page.locator('body').innerText();
const inServizio = bodyText.match(/IN SERVIZIO\s*(\d+)/i);

console.log('mezzi "In servizio" nel DOM:', inServizio ? inServizio[1] : 'sezione non trovata');
console.log('fotogramma piu lungo durante il polling:', blocked, 'ms');
const nonTile = errors.filter((error) => !/tile\.openstreetmap|ERR_TUNNEL/.test(error));
console.log('errori console (escluse le tile di mappa):', nonTile.length);
nonTile.slice(0, 6).forEach((error) => console.log('  *', error));
console.log('errori console totali:', errors.length);
errors.slice(0, 6).forEach((error) => console.log('  -', error));

await browser.close();
