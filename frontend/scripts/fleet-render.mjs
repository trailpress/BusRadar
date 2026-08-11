// Generates the vehicle-detail render for one fleet cluster.
//
// The prompt is not written here: it lives with the cluster in
// `src/data/gttFleetCatalog.ts`, next to the fleet numbers, the livery and the
// sources the model was checked against. Every cluster shares the same opening
// prompt, which is what makes the renders read as one family, so a render
// produced through this script is aligned with the existing ones by
// construction rather than by hand.
//
// Usage:
//   node scripts/fleet-render.mjs --cluster <fleet-key> [--dry-run] [--out <path>]
//                                 [--variant <name>] [--reference <path>]
//
// Un cluster può portare una `referenceAsset`: in quel caso l'immagine viene
// mandata all'API insieme al prompt e il modello ridisegna quel mezzo invece di
// interpretare una descrizione. Serve dove le parole non bastano, ed è il caso
// della serie 5000: descritta a parole era tornata indietro come un tram che
// non esiste. `--reference` la sovrascrive, `--reference none` la disattiva.
//
// `--variant v7` scrive `<chiave>-gtt-render-v7.webp` invece di
// `<chiave>-gtt-render.webp`. Gli asset in `public/` sono serviti a URL stabile,
// senza hash: rigenerando sotto lo stesso nome, browser e CDN continuano a
// servire il file vecchio e il render nuovo non si vede.
//
// Needs OPENAI_API_KEY unless --dry-run is given. The GitHub workflow
// `generate-fleet-render.yml` is the normal way to run it.

import fs from 'node:fs';
import path from 'node:path';
import { GTT_FLEET_CATALOG } from '../src/data/gttFleetCatalog.ts';

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}
const dryRun = args.includes('--dry-run');
const clusterKey = arg('cluster');

if (!clusterKey) {
  console.error('Missing --cluster. Available clusters:\n');
  for (const cluster of GTT_FLEET_CATALOG) {
    console.error(`  ${cluster.key.padEnd(32)} ${cluster.assetStatus.padEnd(24)} ${cluster.label}`);
  }
  process.exit(1);
}

const cluster = GTT_FLEET_CATALOG.find((item) => item.key === clusterKey);
if (!cluster) {
  console.error(`Unknown cluster "${clusterKey}". Run without --cluster to list them.`);
  process.exit(1);
}

const variant = arg('variant');
const outputPath = arg('out') ?? path.join(
  'public/assets/vehicles/detail/generated',
  `${cluster.key}-gtt-render${variant ? `-${variant}` : ''}.webp`,
);

const referenceArg = arg('reference');
const referenceAsset = referenceArg === 'none' ? undefined : referenceArg ?? cluster.referenceAsset;
const referencePath = referenceAsset
  ? (fs.existsSync(referenceAsset) ? referenceAsset : path.join('public', referenceAsset))
  : undefined;
if (referencePath && !fs.existsSync(referencePath)) {
  console.error(`Reference image not found: ${referencePath}`);
  process.exit(1);
}

console.log(`Cluster : ${cluster.key}`);
console.log(`Label   : ${cluster.label}`);
console.log(`Fleet   : ${cluster.fleetNumbers.join(', ')}`);
console.log(`Livery  : ${cluster.livery}`);
console.log(`Sources : ${cluster.sourceNotes}`);
console.log(`Output  : ${outputPath}`);
console.log(`Reference: ${referencePath ?? 'nessuna, solo il prompt'}`);
console.log(`\nPrompt:\n${cluster.renderPrompt}\n`);

if (!cluster.renderPrompt.trim()) {
  console.error('Questo cluster ha `renderPrompt` vuoto. È una scelta, non una dimenticanza:');
  console.error('leggi `sourceNotes` prima di riempirlo.');
  process.exit(1);
}

if (dryRun) {
  console.log('Dry run: nothing generated.');
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(1);
}

// The model has returned a cutout on a transparent background before, despite
// being asked for an opaque one. Left alone, that becomes a ragged white fringe
// the moment the render is shown on the dark card, which is exactly how the
// tram 5000 asset went wrong. Composite whatever comes back onto the studio
// background, and size it to the budget the app checks.
const STUDIO_BACKGROUND = { r: 8, g: 8, b: 10 };

async function finish(buffer) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp is not available: writing the image unprocessed. Check the background and the edges by eye.');
    return buffer;
  }

  const { hasAlpha } = await sharp(buffer).metadata();
  if (hasAlpha) console.log('The image came back with an alpha channel: flattening it onto the studio background.');

  return sharp(buffer)
    .flatten({ background: STUDIO_BACKGROUND })
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

const MODEL = 'gpt-image-2';
const SIZE = '1536x1024';

// Con un riferimento si passa dall'endpoint delle modifiche, che accetta
// l'immagine insieme al prompt: il modello ridisegna quel mezzo invece di
// interpretare una descrizione. Senza, resta la generazione da solo testo.
async function requestImage() {
  if (!referencePath) {
    return fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: cluster.renderPrompt,
        size: SIZE,
        quality: 'high',
        background: 'opaque',
        output_format: 'webp',
        n: 1,
      }),
    });
  }

  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', cluster.renderPrompt);
  form.append('size', SIZE);
  form.append('quality', 'high');
  form.append('n', '1');
  form.append(
    'image[]',
    new Blob([fs.readFileSync(referencePath)], { type: 'image/webp' }),
    path.basename(referencePath),
  );
  return fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
}

const response = await requestImage();

if (!response.ok) {
  throw new Error(`OpenAI image generation failed (${response.status}): ${await response.text()}`);
}

const payload = await response.json();
const image = payload?.data?.[0]?.b64_json;
if (!image) throw new Error('The image response carried no data.');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, await finish(Buffer.from(image, 'base64')));

const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
console.log(`Written ${outputPath} (${sizeKb} kB).`);
console.log('\nBefore merging, check the render against the sources above: model, series and livery.');
console.log('Then point the cluster at it and set assetStatus to validated-render.');
