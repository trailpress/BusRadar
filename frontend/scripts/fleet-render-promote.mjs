// Points a fleet cluster at its freshly generated render and marks it
// validated. Kept separate from generation so the default run produces a render
// to look at without touching what the app shows: a render is only validated by
// a human comparing it to the sources on the cluster.
//
// Usage: node scripts/fleet-render-promote.mjs --cluster <fleet-key>

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const clusterKey = args[args.indexOf('--cluster') + 1];
if (!clusterKey || clusterKey.startsWith('--')) {
  console.error('Usage: node scripts/fleet-render-promote.mjs --cluster <fleet-key>');
  process.exit(1);
}

const assetPath = `assets/vehicles/detail/generated/${clusterKey}-gtt-render.webp`;
if (!fs.existsSync(path.join('public', assetPath))) {
  console.error(`No render at public/${assetPath}. Generate it first.`);
  process.exit(1);
}

const catalogPath = 'src/data/gttFleetCatalog.ts';
const source = fs.readFileSync(catalogPath, 'utf8');

// Each cluster is an object literal opening with its key, so the block runs
// from that key to the start of the next one.
const keyMarker = `key: '${clusterKey}',`;
const start = source.indexOf(keyMarker);
if (start < 0) {
  console.error(`Cluster ${clusterKey} not found in ${catalogPath}.`);
  process.exit(1);
}
const nextKey = source.indexOf("    key: '", start + keyMarker.length);
const end = nextKey < 0 ? source.length : nextKey;
const block = source.slice(start, end);

let updated = block;
updated = updated.includes('    asset: ')
  ? updated.replace(/ {4}asset: '[^']*',/, `    asset: '${assetPath}',`)
  : updated.replace(/( {4}assetStatus: )/, `    asset: '${assetPath}',\n$1`);
updated = updated.replace(/ {4}assetStatus: '[^']*',/, "    assetStatus: 'validated-render',");

if (updated === block) {
  console.error(`Nothing changed for ${clusterKey}: check the catalog formatting.`);
  process.exit(1);
}

fs.writeFileSync(catalogPath, source.slice(0, start) + updated + source.slice(end));
console.log(`${clusterKey} now points at ${assetPath} and is marked validated-render.`);
