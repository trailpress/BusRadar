import type { VehicleFleetKey } from '../types/transit';
import { GTT_FLEET_CATALOG_BY_KEY, type GttFleetCluster } from './gttFleetCatalog';

type VehicleFleetProfile = {
  label: string;
  detailAsset?: string;
  referenceNotes: string;
  assetStatus?: GttFleetCluster['assetStatus'];
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  'tram-serie-2800': {
    label: 'Tram serie 2800',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-2800-gtt-render.webp',
    referenceNotes: 'Schede ufficiali M1-M3: motrice a 2 casse e 3 carrelli, 20.145 mm, 4 porte.',
  },
  'tram-serie-5000': {
    label: 'Tram serie 5000',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-5000-gtt-render-v9.webp',
    referenceNotes: 'Scheda ufficiale M4: TPR a pavimento ribassato, 22.200 mm, 2 casse e 3 carrelli, 1989-1992. Render generato dall\'API sulla vettura 5014 tenuta come riferimento visivo.',
  },
  'tram-serie-6000': {
    label: 'Tram serie 6000 Cityway',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-6000-cityway-gtt-render.webp',
    referenceNotes: 'Schede ufficiali M5-M6: TPIR a 7 casse, 34.000 mm, versioni mono/bidirezionali.',
  },
  'tram-serie-8000': {
    label: 'Tram serie 8000 Hitachi',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-8000-hitachi-gtt-render-v3.webp',
    referenceNotes: 'Render v3 riallineato alle foto reali 8000: Hitachi a 5 casse, livrea grigio/blu/giallo e solare spento.',
  },
  'generic-tram': {
    label: 'Tram GTT (modello non identificato)',
    referenceNotes: 'Il feed ha classificato il veicolo come tram, ma il suo identificativo non corrisponde a una serie GTT verificata.',
    assetStatus: 'needs-reference-render',
  },
  'byd-k7-electric-9m': {
    label: 'BYD K7 elettrico 8,8m',
    detailAsset: 'assets/vehicles/detail/generated/byd-k7-electric-9m-gtt-render-v3.webp',
    referenceNotes: 'Render v3 riallineato alle foto reali 50E-57E: midibus corto 8,75 m e livrea bianca/verde/arancio.',
  },
  'byd-k9ub-2017-12m': {
    label: 'BYD K9UB elettrico 12m (2017)',
    detailAsset: 'assets/vehicles/detail/generated/byd-k9ub-2017-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale UL03: serie 30E-49E, 12.050 mm, livrea artistica bianca-verde-arancio.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD K9UB-DW elettrico 12m',
    detailAsset: 'assets/vehicles/detail/generated/byd-k9ub-2021-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale UL06: serie 9000-9059, 12.200 mm, livrea elettrica blu-giallo.',
  },
  'byd-k9ud-2023-12m': {
    label: 'BYD K9UD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/generated/byd-k9ud-2023-gtt-render.webp',
    referenceNotes: 'Schede ufficiali UL07-UL08: serie 9060-9121, 12.200 mm, livrea elettrica blu-giallo.',
  },
  'indcar-eb6-electric-6m': {
    label: 'INDCAR e-B6 elettrico 5,9m',
    detailAsset: 'assets/vehicles/detail/generated/indcar-eb6-electric-6m-gtt-render-v3.webp',
    referenceNotes: 'Scheda ufficiale UC03: serie 60E-81E, lunghezza 5.940 mm, 1 porta, 126 kWh.',
  },
  'bmc-neocity-9m': {
    label: 'BMC Neocity 8,5m',
    detailAsset: 'assets/vehicles/detail/generated/bmc-neocity-9m-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale UC02: serie 110-115, lunghezza 8.500 mm, diesel Euro 6.',
  },
  'iia-citymood-cng-12m': {
    label: 'Menarini Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/generated/iia-citymood-cng-12m-gtt-render-v5.webp',
    referenceNotes: 'Schede ufficiali UL09-UL10: serie 9200-9261, lunghezza 12.100 mm, CNG.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-citelis-12m-gtt-render-v3.webp',
    referenceNotes: 'Render v3 riallineato alla serie 3000: Irisbus Citelis 12.29 EEV, 3 porte, livrea GTT bianco/blu/gialla e solare spento.',
  },
  'iveco-eway-electric-12m': {
    label: 'Iveco E-Way elettrico 12m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-eway-electric-12m-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale UL11: serie 9400-9535, lunghezza 12.050 mm, elettrico.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way elettrico 18m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-eway-electric-18m-standard-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale USN08: serie 9600-9661, lunghezza 17.960 mm.',
  },
  'iveco-eway-electric-18m-brt': {
    label: 'Iveco E-Way elettrico 18m BRT',
    detailAsset: 'assets/vehicles/detail/generated/iveco-eway-electric-18m-brt-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale USN09: serie 9700-9727, lunghezza 18.212 mm, allestimento BRT.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway CNG 18m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-urbanway-cng-18m-gtt-render-v3.webp',
    referenceNotes: 'Schede ufficiali USN06-USN07: serie 9300-9356, lunghezza 18.003 mm, CNG.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/generated/irisbus-citelis-18m-gtt-render-v2.webp',
    referenceNotes: 'Schede ufficiali USN01-USN04: serie 790-797, 800-874 e 1310-1313, lunghezza 17.900 mm.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-12m-diesel-gtt-render-v2.webp',
    referenceNotes: 'Compatibilita storica: usare mercedes-conecto-12m-cng per serie 2400 e mercedes-conecto-12m-diesel per serie 3400.',
  },
  'mercedes-conecto-12m-cng': {
    label: 'Mercedes Conecto 12m CNG',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-12m-cng-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale UL05: serie 2400-2447, Conecto CNG con allestimento metano, tetto CNG e livrea gas naturale.',
  },
  'mercedes-conecto-12m-diesel': {
    label: 'Mercedes Conecto 12m diesel',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-12m-diesel-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale UL04 e fotografie reali 3400: Conecto E6 diesel con corpo prevalentemente blu e campo posteriore giallo.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto G 18m',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-18m-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale USN05: serie 1350-1396, lunghezza 18.124 mm.',
  },
  'man-lions-city-19c-cng': {
    label: "MAN Lion's City 19C CNG",
    detailAsset: 'assets/vehicles/detail/generated/man-lions-city-19c-cng-gtt-render-v2.webp',
    referenceNotes: "Render v2 riallineato alle foto reali 1401/1402: MAN 19C snodato blu/nero con minimi accenti gialli.",
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway LE suburbano',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-suburban-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale SL01: serie 1150-1168, lunghezza 11.995 mm.',
  },
  'irisbus-crossway-11m': {
    label: 'Iveco Crossway 10,6m',
    detailAsset: 'assets/vehicles/detail/generated/irisbus-crossway-11m-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale IM01: serie 230-241, lunghezza 10.655 mm.',
  },
  'irisbus-crossway-12m': {
    label: 'Iveco Crossway 12m',
    detailAsset: 'assets/vehicles/detail/generated/irisbus-crossway-12m-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale IL01: serie 320-365, lunghezza 11.995 mm.',
  },
  'iveco-crossway-line-12m': {
    label: 'Iveco Crossway LE 12m (2019)',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-le-2019-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale IL02: serie 366-406, lunghezza 12.050 mm.',
  },
  'iveco-crossway-line-2022-12m': {
    label: 'Iveco Crossway 12m (2022)',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-line-2022-gtt-render.webp',
    referenceNotes: 'Scheda ufficiale IL03: serie 601S-650S, lunghezza 12.097 mm.',
  },
  'iveco-crossway-line-cng-12m': {
    label: 'Iveco Crossway 12m CNG',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-line-cng-12m-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale IL04: serie 651S-692S, lunghezza 12.097 mm, CNG.',
  },
  'irisbus-arway-15m': {
    label: 'Irisbus Arway 15m',
    detailAsset: 'assets/vehicles/detail/generated/irisbus-arway-15m-gtt-render-v2.webp',
    referenceNotes: 'Scheda ufficiale IL05: serie 500-502, lunghezza 14.995 mm.',
  },
  'iveco-mago-granturismo-9m': {
    label: 'Iveco Mago 2 granturismo',
    detailAsset: 'assets/vehicles/detail/generated/iveco-mago-granturismo-9m-gtt-render-v3.webp',
    referenceNotes: 'Schede ufficiali GC01-GC02: serie 19/20, lunghezza 8.850 mm.',
  },
  'generic-bus': {
    label: 'Bus GTT non identificato',
    detailAsset: 'assets/vehicles/detail/generated/generic-gtt-urban-bus-render.webp',
    referenceNotes: 'Render GTT generico usato solo quando il feed non espone una matricola ufficiale riconducibile al PDF.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  const key = fleetKey ?? 'generic-bus';
  const catalogProfile = GTT_FLEET_CATALOG_BY_KEY[key];
  return {
    ...VEHICLE_FLEET_PROFILES[key],
    detailAsset: catalogProfile?.asset ?? VEHICLE_FLEET_PROFILES[key].detailAsset,
    assetStatus: catalogProfile?.assetStatus ?? 'placeholder-render',
  };
}
