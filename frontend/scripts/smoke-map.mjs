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
// Due mezzi che sulla mappa si somigliano e non vanno trattati allo stesso
// modo: il primo manda campioni nuovi e non si sposta - e' fermo, e lo sappiamo
// per averlo misurato; il secondo ha il timestamp bloccato, quindi non c'e'
// modo di misurarlo. Sul primo la previsione va ignorata, altrimenti il marker
// scivola avanti mentre il mezzo sta fermo; sul secondo la previsione e'
// l'unico dato che abbiamo, e prima veniva buttata via.
const stillFeed = process.argv.includes('--feed-fermo');
const frozenSince = Math.floor(Date.now() / 1000) - 20;
const vehicles = chosen.map((route, index) => {
  const middle = Math.floor(route.stopEntries.length / 2);
  const stop = stopById.get(route.stopEntries[middle].stopId);
  return {
    nextStopId: route.stopEntries[Math.min(route.stopEntries.length - 1, middle + 2)].stopId,
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

// Il feed vero rinfresca un mezzo ogni ~15 s mentre l'app interroga ogni 6, e
// manda `speed` sempre a zero. Riprodurre quel disallineamento e' l'unico modo
// di accorgersi se la velocita' viene ancora ricavata dallo spostamento: con la
// media avvelenata dagli zeri, la scheda dichiarava "mezzo fermo" su vetture in
// corsa e la compensazione restava spenta.
const movingFeed = process.argv.includes('--feed-mobile');
const startedAt = Date.now();

await page.route('**/gtt-realtime/vehicles', (route) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = stillFeed
    ? vehicles.map((vehicle, index) => ({
        ...vehicle,
        speed: 0,
        // Il primo: campione nuovo a ogni giro, posizione sempre la stessa.
        // Il secondo: sempre lo stesso campione, quindi niente da misurare.
        timestamp: String(index === 0 ? nowSeconds - 20 : frozenSince),
      }))
    : movingFeed
    ? vehicles.map((vehicle, index) => {
        // Un campione nuovo ogni 15 s, e nel frattempo lo stesso identico.
        const tick = Math.floor((Date.now() - startedAt) / 15000);
        return {
          ...vehicle,
          // ~30 km/h verso est: 125 m ogni quindici secondi.
          lon: vehicle.lon + tick * 0.0016,
          speed: 0,
          timestamp: String(Math.floor(startedAt / 1000) + tick * 15 - 12 - index),
        };
      })
    : vehicles;
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      entityCount: payload.length,
      vehiclePositionCount: payload.length,
      header: { timestamp: nowSeconds },
      vehicles: payload,
    }),
  });
});
await page.route('**/gtt-realtime/trips', (route) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tripUpdates = stillFeed
    ? vehicles.map((vehicle) => ({
        routeId: vehicle.routeId,
        tripId: vehicle.tripId,
        vehicleId: vehicle.vehicleId,
        vehicleLabel: vehicle.vehicleLabel,
        timestamp: String(nowSeconds),
        stopTimeUpdates: [
          {
            stopId: vehicle.nextStopId,
            stopSequence: null,
            arrivalDelay: 60,
            arrivalTime: String(nowSeconds + 120),
            departureDelay: 60,
            departureTime: String(nowSeconds + 130),
          },
        ],
      }))
    : [];
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', tripUpdates }) });
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(movingFeed ? 60000 : 9000);

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

// Solo i due mezzi tracciati: le corse previste portano una velocita' loro,
// ricavata dall'orario, e conteggiarle nasconderebbe proprio il difetto.
for (const vehicle of vehicles) {
  const row = bodyText.match(new RegExp(`${vehicle.vehicleId}[\\s\\S]{0,120}?(\\d+)\\s*km/h`));
  console.log(`velocita del mezzo tracciato ${vehicle.vehicleId}:`, row ? `${row[1]} km/h` : 'riga non trovata');
}
console.log('mezzi "In servizio" nel DOM:', inServizio ? inServizio[1] : 'sezione non trovata');

// Con il feed vuoto in mappa ci sono solo corse non accertate. La loro scheda
// non deve dichiarare niente che nessuno ha osservato: non un identificativo
// «del feed», che il feed non ha mai mandato, e non un render «verificato»,
// perche' li' non c'e' nessun mezzo da verificare.
if (emptyFeed) {
  await page.getByText(/Corsa .* non accertata|Corsa non accertata/).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const sheetText = await page.locator('body').innerText();
  const aperta = /Dettagli mezzo/.test(sheetText);
  const bugie = [
    ['ID feed', /ID feed/.test(sheetText)],
    ['Render verificato', /Render verificato/i.test(sheetText)],
    ['Identificativo tecnico GTFS-RT', /Identificativo tecnico GTFS-RT/.test(sheetText)],
  ].filter(([, presente]) => presente).map(([nome]) => nome);
  console.log(`scheda corsa non accertata: ${aperta ? 'aperta' : 'non aperta'}`
    + ` · dichiarazioni non vere: ${bugie.length === 0 ? 'nessuna [ok]' : bugie.join(', ')}`);
  // L'immagine deve esserci e deve essere accompagnata da cosa rappresenta:
  // senza quella riga un lettore la prende per il mezzo che sta guardando,
  // mentre e' solo il tipo di mezzo che quella linea usa.
  const render = page.locator('.vehicle-sheet img.vehicle-render').first();
  const src = await render.getAttribute('src').catch(() => null);
  const didascalia = /tipo di mezzo della linea · nessun mezzo osservato/.test(sheetText);
  console.log(`render della classe: ${src ? src.split('/').pop() : 'assente'}`
    + ` · didascalia: ${didascalia ? 'presente [ok]' : 'mancante'}`);
  if (process.env.SMOKE_SHOT) {
    await page.screenshot({ path: process.env.SMOKE_SHOT });
    console.log('schermata salvata in', process.env.SMOKE_SHOT);
  }
}

// La riga deve dire due cose diverse sui due mezzi: "fermo, misurato" sul
// primo, "previsione fermata" sul secondo. Se dicesse la stessa cosa su
// entrambi, o l'osservazione o la previsione starebbe venendo ignorata.
if (stillFeed) {
  // Sul secondo non si pretende quale delle due stime da orario abbia vinto -
  // dipende dalla variante su cui l'app aggancia il mezzo finto - ma che una
  // delle due sia stata usata: "m avanti" significa correzione applicata.
  const atteso = ['fermo, misurato', 'm avanti'];
  for (const [index, vehicle] of vehicles.entries()) {
    // Chiudere la scheda riporta alla mappa, non all'elenco: senza tornarci il
    // secondo mezzo non e' cliccabile e il controllo passerebbe a vuoto.
    await page.getByRole('button', { name: 'Vetture' }).click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByText(vehicle.vehicleId, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    // La telemetria non si stampa piu' sulla scheda - serviva a chi tarava
    // l'algoritmo, non a chi aspetta il bus - ma il controllo resta: si legge
    // dall'attributo `data-latenza`, che il lettore non vede.
    const testo = await page.locator('.vehicle-sheet').first().getAttribute('data-latenza')
      ?? 'attributo non trovato';
    const esito = testo.includes(atteso[index]) ? 'ok' : `atteso "${atteso[index]}"`;
    console.log(`mezzo ${vehicle.vehicleId} (${index === 0 ? 'misurato fermo' : 'non misurabile'}): ${testo} [${esito}]`);
    await page.getByRole('button', { name: 'Chiudi dettaglio' }).click().catch(() => {});
    await page.waitForTimeout(600);
  }
}
console.log('fotogramma piu lungo durante il polling:', blocked, 'ms');
const nonTile = errors.filter((error) => !/tile\.openstreetmap|ERR_TUNNEL/.test(error));
console.log('errori console (escluse le tile di mappa):', nonTile.length);
nonTile.slice(0, 6).forEach((error) => console.log('  *', error));
console.log('errori console totali:', errors.length);
errors.slice(0, 6).forEach((error) => console.log('  -', error));

await browser.close();
