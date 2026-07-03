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
    referenceNotes: 'Tram GTT: render 3D dedicato, senza usare direttamente foto di riferimento.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD elettrico 9m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-neutral.png',
    referenceNotes: 'Serie compatta elettrica: usa la livrea elettrica GTT blu/gialla finche non viene validato il render 9m dedicato.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-real-3d.png',
    referenceNotes: 'Serie 9000-9099: render 3D BYD elettrico 12m, senza usare direttamente foto di riferimento.',
  },
  'iia-citymood-cng-12m': {
    label: 'IIA Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/iia-citymood-cng-12m-gtt-neutral.png',
    referenceNotes: 'Serie 9200-9299: render 2D laterale metano 12m con serbatoi CNG a tetto e livrea GTT.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-3d.png',
    referenceNotes: 'Serie 3000-3380: render 3D urbano 12m provvisorio per Citelis, senza usare direttamente foto di riferimento.',
  },
  'iveco-eway-electric-12m': {
    label: 'Elettrico GTT 12m',
    detailAsset: 'assets/vehicles/detail/byd-electric-12m-3d-v2.png',
    referenceNotes: 'Serie 9400-9535: render 3D elettrico 12m provvisorio, in attesa di E-Way dedicato validato.',
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
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-3d-v2.png',
    referenceNotes: 'Serie 790-797 e 875-899: render 3D snodato urbano provvisorio, separato dalla serie 800 Van Hool.',
  },
  'vanhool-ag300-18m': {
    label: 'Van Hool AG300 18m',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-3d-v2.png',
    referenceNotes: 'Serie 800-874: classificazione Van Hool AG300; asset 3D provvisorio finche non viene validato un render dedicato.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-3d.png',
    referenceNotes: 'Serie 2400-2499 e 3400-3440: render 3D urbano 12m provvisorio, senza usare direttamente foto di riferimento.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto 18m',
    detailAsset: 'assets/vehicles/detail/mercedes-conecto-18m-3d.png',
    referenceNotes: 'Serie 1300-1399: render 3D snodato urbano Mercedes, senza overlay livrea appiccicati.',
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
