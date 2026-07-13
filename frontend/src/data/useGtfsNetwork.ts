import { useEffect, useSyncExternalStore } from 'react';
import {
  getGtfsNetworkRevision,
  isGtfsNetworkLoaded,
  loadGtfsNetwork,
  subscribeGtfsNetwork,
} from './gtfsNetwork';

export function useGtfsNetwork() {
  const revision = useSyncExternalStore(
    subscribeGtfsNetwork,
    getGtfsNetworkRevision,
    getGtfsNetworkRevision,
  );

  useEffect(() => {
    if (!isGtfsNetworkLoaded()) void loadGtfsNetwork().catch(() => undefined);
  }, []);

  return {
    revision,
    loaded: isGtfsNetworkLoaded(),
  };
}
