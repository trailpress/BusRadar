import { getGtfsRouteDirectionKey, getGtfsStopsForRoute, type GtfsRouteVariant } from '../data/gtfsNetwork';
import { routeDirectionColor } from '../utils/routePalette';

type Props = {
  routes: GtfsRouteVariant[];
  selectedRouteKey?: string;
  onChange: (routeKey?: string) => void;
  compact?: boolean;
};

function destinationLabel(route: GtfsRouteVariant, routes: GtfsRouteVariant[]) {
  const destination = route.headsign.replace(/^NULL,?\s*/i, '').trim() || `Direzione ${route.directionId}`;
  const duplicateDestination = routes.filter((candidate) => candidate.headsign.trim() === route.headsign.trim()).length > 1;
  if (!duplicateDestination) return destination;
  const origin = getGtfsStopsForRoute(route)[0]?.name;
  return origin ? `${destination} da ${origin}` : destination;
}

export function RouteDirectionSelector({ routes, selectedRouteKey, onChange, compact = false }: Props) {
  if (routes.length < 2) return null;

  return (
    <div className={`route-direction-selector${compact ? ' is-compact' : ''}`} role="group" aria-label="Direzione della linea">
      <button type="button" className={selectedRouteKey == null ? 'is-active' : undefined} onClick={() => onChange(undefined)} aria-pressed={selectedRouteKey == null}>
        Entrambe
      </button>
      {routes.map((route, index) => {
        const routeKey = getGtfsRouteDirectionKey(route);
        return (
          <button
            type="button"
            className={selectedRouteKey === routeKey ? 'is-active' : undefined}
            key={routeKey}
            onClick={() => onChange(routeKey)}
            aria-pressed={selectedRouteKey === routeKey}
          >
            <span className="direction-swatch" style={{ backgroundColor: routeDirectionColor(index) }} />
            <span>{destinationLabel(route, routes)}</span>
          </button>
        );
      })}
    </div>
  );
}
