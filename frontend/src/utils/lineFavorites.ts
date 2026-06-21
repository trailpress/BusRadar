const storageKey = 'busradar:line-favorites';

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function isLineFavorite(lineId: string, fallback = false) {
  const override = readOverrides()[lineId];
  return override ?? fallback;
}

export function setLineFavorite(lineId: string, favorite: boolean) {
  const overrides = readOverrides();
  overrides[lineId] = favorite;
  localStorage.setItem(storageKey, JSON.stringify(overrides));
}
