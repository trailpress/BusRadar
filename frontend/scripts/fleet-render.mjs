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

const outputPath = arg('out') ?? path.join('public/assets/vehicles/detail/generated', `${cluster.key}-gtt-render.webp`);

console.log(`Cluster : ${cluster.key}`);
console.log(`Label   : ${cluster.label}`);
console.log(`Fleet   : ${cluster.fleetNumbers.join(', ')}`);
console.log(`Livery  : ${cluster.livery}`);
console.log(`Sources : ${cluster.sourceNotes}`);
console.log(`Output  : ${outputPath}`);
console.log(`\nPrompt:\n${cluster.renderPrompt}\n`);

if (dryRun) {
  console.log('Dry run: nothing generated.');
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(1);
}

const response = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: cluster.renderPrompt,
    size: '1536x1024',
    quality: 'high',
    background: 'opaque',
    output_format: 'webp',
    n: 1,
  }),
});

if (!response.ok) {
  throw new Error(`OpenAI image generation failed (${response.status}): ${await response.text()}`);
}

const payload = await response.json();
const image = payload?.data?.[0]?.b64_json;
if (!image) throw new Error('The image response carried no data.');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(image, 'base64'));

const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
console.log(`Written ${outputPath} (${sizeKb} kB).`);
console.log('\nBefore merging, check the render against the sources above: model, series and livery.');
console.log('Then point the cluster at it and set assetStatus to validated-render.');
