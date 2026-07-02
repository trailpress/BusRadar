import type { VehicleFleetKey } from '../types/transit';

type VehicleFleetProfile = {
  label: string;
  detailAsset: string;
  referenceNotes: string;
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  tram: {
    label: 'Tram GTT',
    detailAsset: 'assets/vehicles/detail/photo/tram-serie-5000-photo-gtt.png',
    referenceNotes: 'Tram GTT: asset foto-render da riferimento reale serie 5000, livrea grigio/blu/gialla.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD elettrico 9m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-reference.svg',
    referenceNotes: 'Serie compatta elettrica: usa la livrea elettrica GTT blu/gialla finche non viene validato il render 9m dedicato.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-reference.svg',
    referenceNotes: 'Serie 9000-9099: render laterale dedicato BYD elettrico 12m con livrea GTT blu/gialla.',
  },
  'iia-citymood-cng-12m': {
    label: 'IIA Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-neutral.png',
    referenceNotes: 'Serie 9200-9299: render 2D laterale metano 12m con serbatoi CNG a tetto e livrea GTT.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/irisbus-citelis-12m-3000-gtt-reference.svg',
    referenceNotes: 'Serie 3000-3380: render laterale dedicato Irisbus/Iveco Citelis 12m con livrea GTT storica.',
  },
  'iveco-eway-electric-12m': {
    label: 'Elettrico GTT 12m',
    detailAsset: 'assets/vehicles/detail/photo/byd-electric-12m-photo-gtt.png',
    referenceNotes: 'Serie 9400-9535: asset elettrico GTT provvisorio da riferimento reale, in attesa di foto-render E-Way dedicato validato.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way 18m elettrico',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-neutral.png',
    referenceNotes: 'Serie 9600-9727: render snodato urbano GTT neutralizzato, senza numero fisso, finche non viene validato un E-Way 18m dedicato.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway 18m CNG',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-gtt-neutral.png',
    referenceNotes: 'Serie 9300-9399: render 2D laterale snodato urbano metano con soffietto centrale e livrea GTT.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/photo/irisbus-citelis-18m-photo-gtt.png',
    referenceNotes: 'Serie 790-797 e 875-899: asset foto-render Citelis 18m GTT, separato dalla serie 800 Van Hool.',
  },
  'vanhool-ag300-18m': {
    label: 'Van Hool AG300 18m',
    detailAsset: 'assets/vehicles/detail/vanhool-ag300-18m-800-gtt-reference.svg',
    referenceNotes: 'Serie 800-874: render laterale dedicato Van Hool AG300 snodato GTT.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/photo/mercedes-conecto-12m-photo-gtt.png',
    referenceNotes: 'Serie 2400-2499 e 3400-3440: asset foto-render da riferimento reale Conecto 12m GTT.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto 18m',
    detailAsset: 'assets/vehicles/detail/mercedes-conecto-18m-gtt-neutral.png',
    referenceNotes: 'Serie 1300-1399: render 2D laterale snodato urbano Mercedes con livrea GTT.',
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway suburbano',
    detailAsset: 'assets/vehicles/detail/iveco-crossway-suburban-gtt-neutral.png',
    referenceNotes: 'Serie suburbana/intercomunale blu: render 2D laterale Crossway low-entry/intercity con marcatura GTT.',
  },
  'generic-bus': {
    label: 'Bus GTT',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-neutral.png',
    referenceNotes: 'Fallback urbano 12m GTT neutralizzato, senza numero fisso, usato solo quando il feed non permette di riconoscere la serie.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  return VEHICLE_FLEET_PROFILES[fleetKey ?? 'generic-bus'];
}
