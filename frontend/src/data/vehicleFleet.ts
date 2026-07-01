import type { VehicleFleetKey } from '../types/transit';

type VehicleFleetProfile = {
  label: string;
  detailAsset: string;
  referenceNotes: string;
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  tram: {
    label: 'Tram GTT',
    detailAsset: 'assets/vehicles/detail/tram-3d.png',
    referenceNotes: 'Tram serie 5000/6000 GTT: veicolo articolato urbano con livrea grigio/blu/gialla.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD elettrico 9m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-real-3d.png',
    referenceNotes: 'Serie compatta elettrica: asset temporaneo condiviso con BYD finche non viene validato il render 9m.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-real-3d.png',
    referenceNotes: 'Serie 9000-9099: urbano elettrico 12m con livrea GTT elettrica.',
  },
  'iia-citymood-cng-12m': {
    label: 'IIA Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-real-3d.png',
    referenceNotes: 'Serie 9200-9299: urbano metano 12m con serbatoi CNG a tetto.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-3d.png',
    referenceNotes: 'Serie 3000-3380: asset da sostituire con Citelis 12m validato.',
  },
  'iveco-eway-electric-12m': {
    label: 'Iveco E-Way 12m elettrico',
    detailAsset: 'assets/vehicles/detail/electric-standard-12m-3d.png',
    referenceNotes: 'Serie 9400-9535: asset da sostituire con E-Way 12m validato.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way 18m elettrico',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-3d-v2.png',
    referenceNotes: 'Serie 9600-9727: asset da sostituire con E-Way 18m validato.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway 18m CNG',
    detailAsset: 'assets/vehicles/detail/iveco-urbanway-cng-18m-real-3d.png',
    referenceNotes: 'Serie 9300-9399: snodato urbano metano con soffietto centrale.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-3d-v2.png',
    referenceNotes: 'Serie 790-899: asset da sostituire con Citelis 18m validato.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-3d.png',
    referenceNotes: 'Serie 2400-2499 e 3400-3440: asset da sostituire con Conecto 12m validato.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto 18m',
    detailAsset: 'assets/vehicles/detail/mercedes-conecto-18m-3d.png',
    referenceNotes: 'Serie 1300-1399: snodato urbano Mercedes.',
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway suburbano',
    detailAsset: 'assets/vehicles/detail/iveco-crossway-suburban-real-3d.png',
    referenceNotes: 'Serie suburbana/intercomunale blu: carrozzeria Crossway low-entry/intercity.',
  },
  'generic-bus': {
    label: 'Bus GTT',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-3d.png',
    referenceNotes: 'Fallback usato solo quando il feed non permette di riconoscere la serie.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  return VEHICLE_FLEET_PROFILES[fleetKey ?? 'generic-bus'];
}
