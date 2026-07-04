import type { VehicleFleetKey } from '../types/transit';
import { GTT_FLEET_CATALOG_BY_KEY, type GttFleetCluster } from './gttFleetCatalog';

type VehicleFleetProfile = {
  label: string;
  detailAsset: string;
  referenceNotes: string;
  assetStatus?: GttFleetCluster['assetStatus'];
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  'tram-serie-2800': {
    label: 'Tram serie 2800',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-2800-gtt-render.png',
    referenceNotes: 'Schede ufficiali M1-M3: motrice a 2 casse e 3 carrelli, 20.145 mm, 4 porte.',
  },
  'tram-serie-5000': {
    label: 'Tram serie 5000',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-5000-gtt-render.png',
    referenceNotes: 'Scheda ufficiale M4: TPR a 2 casse e 3 carrelli, 22.200 mm, 4 porte.',
  },
  'tram-serie-6000': {
    label: 'Tram serie 6000 Cityway',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-6000-cityway-gtt-render.png',
    referenceNotes: 'Schede ufficiali M5-M6: TPIR a 7 casse, 34.000 mm, versioni mono/bidirezionali.',
  },
  'tram-serie-8000': {
    label: 'Tram serie 8000 Hitachi',
    detailAsset: 'assets/vehicles/detail/generated/tram-serie-8000-hitachi-gtt-render.png',
    referenceNotes: 'Scheda ufficiale M7: TPIR monodirezionale a 5 casse e 3 carrelli, 28.000 mm.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD K7 elettrico 8,8m',
    detailAsset: 'assets/vehicles/detail/generated/byd-k7-electric-9m-gtt-render.png',
    referenceNotes: 'Scheda ufficiale UC01: serie 50E-57E, lunghezza 8.750 mm, 2 porte, 165 kWh.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD K9 elettrico 12m',
    detailAsset: 'assets/vehicles/detail/generated/byd-k9-electric-12m-gtt-render-v3.png',
    referenceNotes: 'Schede ufficiali UL03/UL06/UL07/UL08: serie 30E-49E e 9000-9121, 12.050-12.200 mm.',
  },
  'indcar-eb6-electric-6m': {
    label: 'INDCAR e-B6 elettrico 5,9m',
    detailAsset: 'assets/vehicles/detail/generated/indcar-eb6-electric-6m-gtt-render.png',
    referenceNotes: 'Scheda ufficiale UC03: serie 60E-81E, lunghezza 5.940 mm, 1 porta, 126 kWh.',
  },
  'bmc-neocity-9m': {
    label: 'BMC Neocity 8,5m',
    detailAsset: 'assets/vehicles/detail/generated/bmc-neocity-9m-gtt-render.png',
    referenceNotes: 'Scheda ufficiale UC02: serie 110-115, lunghezza 8.500 mm, diesel Euro 6.',
  },
  'iia-citymood-cng-12m': {
    label: 'Menarini Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/generated/iia-citymood-cng-12m-gtt-render.png',
    referenceNotes: 'Schede ufficiali UL09-UL10: serie 9200-9261, lunghezza 12.100 mm, CNG.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-citelis-12m-gtt-render.png',
    referenceNotes: 'Schede ufficiali UL01-UL02: serie 3000-3099 e 3300-3380, lunghezza 11.990 mm.',
  },
  'iveco-eway-electric-12m': {
    label: 'Iveco E-Way elettrico 12m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-eway-electric-12m-gtt-render.png',
    referenceNotes: 'Scheda ufficiale UL11: serie 9400-9535, lunghezza 12.050 mm, elettrico.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way elettrico 18m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-eway-electric-18m-gtt-render.png',
    referenceNotes: 'Schede ufficiali USN08-USN09: serie 9600-9727, lunghezza 17.960-18.212 mm.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway CNG 18m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-urbanway-cng-18m-gtt-render.png',
    referenceNotes: 'Schede ufficiali USN06-USN07: serie 9300-9356, lunghezza 18.003 mm, CNG.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/generated/irisbus-citelis-18m-gtt-render.png',
    referenceNotes: 'Schede ufficiali USN01-USN04: serie 790-797, 800-874 e 1310-1313, lunghezza 17.900 mm.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-12m-gtt-render.png',
    referenceNotes: 'Schede ufficiali UL04-UL05: serie 2400-2447 e 3400-3440, lunghezza 12.134 mm.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto G 18m',
    detailAsset: 'assets/vehicles/detail/generated/mercedes-conecto-18m-gtt-render.png',
    referenceNotes: 'Scheda ufficiale USN05: serie 1350-1396, lunghezza 18.124 mm.',
  },
  'man-lions-city-19c-cng': {
    label: "MAN Lion's City 19C CNG",
    detailAsset: 'assets/vehicles/detail/generated/man-lions-city-19c-cng-gtt-render.png',
    referenceNotes: "Scheda ufficiale USNE01: serie 1400-1404, lunghezza 18.730 mm, CNG.",
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway LE suburbano',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Scheda ufficiale SL01: serie 1150-1168, lunghezza 11.995 mm.',
  },
  'irisbus-crossway-11m': {
    label: 'Iveco Crossway 10,6m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Scheda ufficiale IM01: serie 230-241, lunghezza 10.655 mm.',
  },
  'irisbus-crossway-12m': {
    label: 'Iveco Crossway 12m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Scheda ufficiale IL01: serie 320-365, lunghezza 11.995 mm.',
  },
  'iveco-crossway-line-12m': {
    label: 'Iveco Crossway 12m / LE',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Schede ufficiali IL02-IL03: serie 366-406 e 601S-650S, lunghezza 12.050-12.097 mm.',
  },
  'iveco-crossway-line-cng-12m': {
    label: 'Iveco Crossway 12m CNG',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Scheda ufficiale IL04: serie 651S-692S, lunghezza 12.097 mm, CNG.',
  },
  'irisbus-arway-15m': {
    label: 'Irisbus Arway 15m',
    detailAsset: 'assets/vehicles/detail/generated/iveco-crossway-blue-gtt-render.png',
    referenceNotes: 'Scheda ufficiale IL05: serie 500-502, lunghezza 14.995 mm.',
  },
  'iveco-mago-granturismo-9m': {
    label: 'Iveco Mago 2 granturismo',
    detailAsset: 'assets/vehicles/detail/generated/iveco-mago-granturismo-9m-gtt-render.png',
    referenceNotes: 'Schede ufficiali GC01-GC02: serie 19/20, lunghezza 8.850 mm.',
  },
  'generic-bus': {
    label: 'Bus GTT',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-neutral.png',
    referenceNotes: 'Fallback urbano GTT usato solo quando la matricola non permette riconoscimento ufficiale.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  const key = fleetKey ?? 'generic-bus';
  return {
    ...VEHICLE_FLEET_PROFILES[key],
    assetStatus: GTT_FLEET_CATALOG_BY_KEY[key]?.assetStatus ?? 'placeholder-render',
  };
}
