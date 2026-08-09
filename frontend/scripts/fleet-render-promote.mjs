// Points a fleet cluster at its freshly generated render and marks it
// validated. Kept separate from generation so the default run produces a render
// to look at without touching what the app shows: a render is only validated by
// a human comparing it to the sources on the cluster.
//
// The asset path lives in two files. `gttFleetCatalog.ts` carries it next to the
// fleet numbers and the sources, and `vehicleFleet.ts` carries it again as the
// `detailAsset` the vehicle sheet actually reads. Updating only the catalog
// leaves the app showing the old render, so both move together.
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
const profilesPath = 'src/data/vehicleFleet.ts';

// Each entry opens with its key, so its block runs to the start of the next one.
function blockRange(source, marker, nextMarker) {
  const start = source.indexOf(marker);
  if (start < 0) return undefined;
  const next = source.indexOf(nextMarker, start + marker.length);
  return { start, end: next < 0 ? source.length : next };
}

const supersededAssets = new Set();

const catalog = fs.readFileSync(catalogPath, 'utf8');
const catalogRange = blockRange(catalog, `key: '${clusterKey}',`, "    key: '");
if (!catalogRange) {
  console.error(`Cluster ${clusterKey} not found in ${catalogPath}.`);
  process.exit(1);
}
const catalogBlock = catalog.slice(catalogRange.start, catalogRange.end);
const catalogPrevious = catalogBlock.match(/ {4}asset: '([^']*)',/)?.[1];
if (catalogPrevious) supersededAssets.add(catalogPrevious);

let catalogUpdated = catalogBlock.includes('    asset: ')
  ? catalogBlock.replace(/ {4}asset: '[^']*',/, `    asset: '${assetPath}',`)
  : catalogBlock.replace(/( {4}assetStatus: )/, `    asset: '${assetPath}',\n$1`);
catalogUpdated = catalogUpdated.replace(/ {4}assetStatus: '[^']*',/, "    assetStatus: 'validated-render',");
if (catalogUpdated === catalogBlock) {
  console.error(`Nothing changed for ${clusterKey} in ${catalogPath}: check the formatting.`);
  process.exit(1);
}
const nextCatalog = catalog.slice(0, catalogRange.start) + catalogUpdated + catalog.slice(catalogRange.end);
fs.writeFileSync(catalogPath, nextCatalog);

const profiles = fs.readFileSync(profilesPath, 'utf8');
const profileRange = blockRange(profiles, `'${clusterKey}': {`, "  '");
let nextProfiles = profiles;
if (profileRange) {
  const profileBlock = profiles.slice(profileRange.start, profileRange.end);
  const profilePrevious = profileBlock.match(/ {4}detailAsset: '([^']*)',/)?.[1];
  if (profilePrevious) supersededAssets.add(profilePrevious);
  const profileUpdated = profileBlock.includes('    detailAsset: ')
    ? profileBlock.replace(/ {4}detailAsset: '[^']*',/, `    detailAsset: '${assetPath}',`)
    : profileBlock.replace(/( {4}referenceNotes: )/, `    detailAsset: '${assetPath}',\n$1`);
  nextProfiles = profiles.slice(0, profileRange.start) + profileUpdated + profiles.slice(profileRange.end);
  fs.writeFileSync(profilesPath, nextProfiles);
} else {
  console.warn(`No profile for ${clusterKey} in ${profilesPath}: the vehicle sheet will keep its current image.`);
}

console.log(`${clusterKey} now points at ${assetPath} in both the catalog and the fleet profiles.`);

// A render nothing points at fails npm run verify:assets, and clusters do share
// files, so only drop one neither file claims any more.
for (const superseded of supersededAssets) {
  if (superseded === assetPath) continue;
  if (!superseded.startsWith('assets/vehicles/detail/generated/')) continue;
  if (nextCatalog.includes(`'${superseded}'`) || nextProfiles.includes(`'${superseded}'`)) {
    console.log(`Kept ${superseded}: something still points at it.`);
    continue;
  }
  fs.rmSync(path.join('public', superseded), { force: true });
  console.log(`Removed the superseded ${superseded}.`);
}
