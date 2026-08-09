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

// Generated renders used to accumulate: superseded versions stayed on disk with
// nothing pointing at them, and 40 MB of the repository was files the app could
// not reach. They are also the heaviest thing a vehicle card downloads, so the
// per-file budget keeps a full-resolution export from slipping back in.
const rendersDir = 'public/assets/vehicles/detail/generated';
const maxRenderKb = 400;
const renderProblems = [];

if (fs.existsSync(path.join(root, rendersDir))) {
  const files = fs.readdirSync(path.join(root, rendersDir));
  for (const file of files) {
    const asset = `assets/vehicles/detail/generated/${file}`;
    if (!references.has(asset)) {
      renderProblems.push(`- ${asset} is not referenced by any fleet cluster`);
      continue;
    }
    const sizeKb = Math.round(fs.statSync(path.join(root, rendersDir, file)).size / 1024);
    if (sizeKb > maxRenderKb) {
      renderProblems.push(`- ${asset} weighs ${sizeKb} kB, over the ${maxRenderKb} kB budget`);
    }
  }
}

if (renderProblems.length > 0) {
  console.error('Fleet render problems:');
  renderProblems.forEach((problem) => console.error(problem));
  process.exit(1);
}

console.log(`Verified ${references.size} public asset references.`);
console.log(`Fleet renders: all referenced and within the ${maxRenderKb} kB budget.`);
