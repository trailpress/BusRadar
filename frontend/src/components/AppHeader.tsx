import { Activity, BusFront, LoaderCircle, MapPin, Route, Search, Signpost } from 'lucide-react';

export type MapSearchSuggestion = {
  id: string;
  kind: 'place' | 'stop' | 'line' | 'vehicle';
  label: string;
  detail: string;
  value: string;
  targetId?: string;
  lat?: number;
  lon?: number;
};

type Props = {
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  searchLoading?: boolean;
  suggestions: MapSearchSuggestion[];
  suggestionsLoading?: boolean;
  onSelectSuggestion: (suggestion: MapSearchSuggestion) => void;
  onRadar: () => void;
};

const suggestionIcon = {
  place: MapPin,
  stop: Signpost,
  line: Route,
  vehicle: BusFront,
};

const appIconUrl = `${import.meta.env.BASE_URL}assets/icons/busradar-app-icon-512.png`;

export function AppHeader({ search, onSearch, onSearchSubmit, searchLoading, suggestions, suggestionsLoading, onSelectSuggestion, onRadar }: Props) {
  const showSuggestions = search.trim().length >= 2 && (suggestions.length > 0 || suggestionsLoading);
  return (
    <header className="app-header">
      <div className="brand-row">
        <div className="brand-mark">
          <img src={appIconUrl} alt="" aria-hidden="true" />
        </div>
        <div>
          <strong>BusRadar</strong>
          <span>Torino · v0.2.1</span>
        </div>
        <button className="live-pill" type="button" onClick={onRadar}>
          <Activity size={14} />
          Live
        </button>
      </div>
      <form
        className="map-search"
        role="search"
        aria-label="Cerca luogo o fermata"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
      >
        <button type="submit" aria-label="Avvia ricerca" disabled={searchLoading}>
          {searchLoading ? <LoaderCircle className="is-spinning" size={18} /> : <Search size={18} />}
        </button>
        <input
          value={search}
          enterKeyHint="search"
          placeholder="Cerca luogo"
          onChange={(event) => onSearch(event.target.value)}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls="map-search-suggestions"
        />
        {showSuggestions && (
          <div className="map-search-suggestions" id="map-search-suggestions" role="listbox">
            {suggestions.map((suggestion) => {
              const SuggestionIcon = suggestionIcon[suggestion.kind];
              return (
                <button
                  type="button"
                  role="option"
                  key={suggestion.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSuggestion(suggestion)}
                >
                  <SuggestionIcon size={16} />
                  <span><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></span>
                </button>
              );
            })}
            {suggestionsLoading && (
              <div className="map-search-suggestion-loading">
                <LoaderCircle className="is-spinning" size={15} />
                Cerco indirizzi nell’area GTT…
              </div>
            )}
          </div>
        )}
      </form>
    </header>
  );
}
