import type { VehicleFleetKey } from '../types/transit';

type VehicleFleetProfile = {
  label: string;
  detailAsset: string;
  referenceNotes: string;
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  tram: {
    label: 'Tram GTT',
    detailAsset: 'assets/vehicles/detail/tram-gtt-2d.png',
    referenceNotes: 'Tram GTT: render 2D laterale con livrea grigio/blu/gialla e marcatura GTT.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD elettrico 9m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-2d.png',
    referenceNotes: 'Serie compatta elettrica: usa la livrea elettrica GTT blu/gialla finche non viene validato il render 9m dedicato.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-2d.png',
    referenceNotes: 'Serie 9000-9099: render 2D laterale urbano elettrico 12m con livrea GTT elettrica blu/gialla.',
  },
  'iia-citymood-cng-12m': {
    label: 'IIA Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-2d.png',
    referenceNotes: 'Serie 9200-9299: render 2D laterale metano 12m con serbatoi CNG a tetto e livrea GTT.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-2d.png',
    referenceNotes: 'Serie 3000-3380: usa asset urbano 12m GTT blu/giallo fino a render Citelis dedicato.',
  },
  'iveco-eway-electric-12m': {
    label: 'Iveco E-Way 12m elettrico',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-2d.png',
    referenceNotes: 'Serie 9400-9535: usa livrea elettrica GTT blu/gialla finche non viene validato il render E-Way dedicato.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way 18m elettrico',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-2d.png',
    referenceNotes: 'Serie 9600-9727: usa render snodato GTT 18m blu/giallo fino a render E-Way dedicato.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway 18m CNG',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-2d.png',
    referenceNotes: 'Serie 9300-9399: render 2D laterale snodato urbano metano con soffietto centrale e livrea GTT.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-2d.png',
    referenceNotes: 'Serie 790-899: usa render snodato urbano GTT 18m fino a render Citelis dedicato.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-2d.png',
    referenceNotes: 'Serie 2400-2499 e 3400-3440: usa asset urbano 12m GTT blu/giallo fino a render Conecto dedicato.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto 18m',
    detailAsset: 'assets/vehicles/detail/mercedes-conecto-18m-gtt-2d.png',
    referenceNotes: 'Serie 1300-1399: render 2D laterale snodato urbano Mercedes con livrea GTT.',
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway suburbano',
    detailAsset: 'assets/vehicles/detail/iveco-crossway-suburban-gtt-2d.png',
    referenceNotes: 'Serie suburbana/intercomunale blu: render 2D laterale Crossway low-entry/intercity con marcatura GTT.',
  },
  'generic-bus': {
    label: 'Bus GTT',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-2d.png',
    referenceNotes: 'Fallback urbano 12m GTT usato solo quando il feed non permette di riconoscere la serie.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  return VEHICLE_FLEET_PROFILES[fleetKey ?? 'generic-bus'];
}
