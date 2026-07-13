import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFiles = [
  'src/data/gttFleetCatalog.ts',
  'src/data/vehicleFleet.ts',
  'src/data/landmarks.ts',
];

const assetPattern = /assets\/[^'"`)]+/g;
const references = new Set();

for (const file of sourceFiles) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const match of source.matchAll(assetPattern)) {
    references.add(match[0]);
  }
}

const missing = [...references]
  .filter((asset) => !fs.existsSync(path.join(root, 'public', asset)))
  .sort();

if (missing.length > 0) {
  console.error('Missing public asset references:');
  missing.forEach((asset) => console.error(`- ${asset}`));
  process.exit(1);
}

console.log(`Verified ${references.size} public asset references.`);
