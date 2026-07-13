const storageKey = 'busradar:vehicle-favorites';

function readFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
}

export function isVehicleFavorite(vehicleId: string) {
  return readFavorites().has(vehicleId);
}

export function setVehicleFavorite(vehicleId: string, favorite: boolean) {
  const favorites = readFavorites();
  if (favorite) favorites.add(vehicleId);
  else favorites.delete(vehicleId);
  localStorage.setItem(storageKey, JSON.stringify([...favorites]));
}
