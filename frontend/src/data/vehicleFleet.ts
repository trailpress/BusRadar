import type { VehicleFleetKey } from '../types/transit';

type VehicleFleetProfile = {
  label: string;
  detailAsset: string;
  referenceNotes: string;
};

export const VEHICLE_FLEET_PROFILES: Record<VehicleFleetKey, VehicleFleetProfile> = {
  tram: {
    label: 'Tram GTT',
    detailAsset: 'assets/vehicles/detail/tram-gtt-livery-3d.png',
    referenceNotes: 'Tram GTT: render 3D con livrea GTT, senza usare direttamente foto di riferimento.',
  },
  'byd-k7-electric-9m': {
    label: 'BYD elettrico 9m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie compatta elettrica: render 3D elettrico con livrea GTT blu/gialla finche non viene validato il render 9m dedicato.',
  },
  'byd-k9-electric-12m': {
    label: 'BYD elettrico 12m',
    detailAsset: 'assets/vehicles/detail/byd-k9-electric-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie 9000-9099: render 3D BYD elettrico 12m con livrea GTT blu/gialla.',
  },
  'iia-citymood-cng-12m': {
    label: 'IIA Citymood CNG 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie 9200-9299: render 3D urbano 12m con livrea GTT e serbatoi a tetto visibili.',
  },
  'iveco-citelis-12m': {
    label: 'Irisbus/Iveco Citelis 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie 3000-3380: render 3D urbano 12m con livrea GTT, provvisorio per Citelis.',
  },
  'iveco-eway-electric-12m': {
    label: 'Elettrico GTT 12m',
    detailAsset: 'assets/vehicles/detail/iveco-eway-electric-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie 9400-9535: render 3D elettrico 12m con livrea GTT, in attesa di E-Way dedicato validato.',
  },
  'iveco-eway-electric-18m': {
    label: 'Iveco E-Way 18m elettrico',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-gtt-livery-3d.png',
    referenceNotes: 'Serie 9600-9727: render 3D snodato con livrea GTT, finche non viene validato un E-Way 18m dedicato.',
  },
  'iveco-urbanway-cng-18m': {
    label: 'Iveco Urbanway 18m CNG',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-gtt-livery-3d.png',
    referenceNotes: 'Serie 9300-9399: render 3D snodato urbano metano con livrea GTT.',
  },
  'irisbus-citelis-18m': {
    label: 'Irisbus Citelis 18m',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-gtt-livery-3d.png',
    referenceNotes: 'Serie 790-797 e 875-899: render 3D snodato urbano con livrea GTT, separato dalla serie 800 Van Hool.',
  },
  'vanhool-ag300-18m': {
    label: 'Van Hool AG300 18m',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-gtt-livery-3d.png',
    referenceNotes: 'Serie 800-874: classificazione Van Hool AG300; render 3D snodato GTT provvisorio finche non viene validato un render dedicato.',
  },
  'mercedes-conecto-12m': {
    label: 'Mercedes Conecto 12m',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie 2400-2499 e 3400-3440: render 3D urbano 12m con livrea GTT.',
  },
  'mercedes-conecto-18m': {
    label: 'Mercedes Conecto 18m',
    detailAsset: 'assets/vehicles/detail/urban-articulated-18m-gtt-livery-3d.png',
    referenceNotes: 'Serie 1300-1399: render 3D snodato urbano con livrea GTT.',
  },
  'iveco-crossway-suburban': {
    label: 'Iveco Crossway suburbano',
    detailAsset: 'assets/vehicles/detail/interurban-blue-12m-gtt-livery-3d.png',
    referenceNotes: 'Serie suburbana/intercomunale blu: render 3D Crossway/intercity con livrea GTT suburbana.',
  },
  'generic-bus': {
    label: 'Bus GTT',
    detailAsset: 'assets/vehicles/detail/urban-standard-12m-gtt-livery-3d.png',
    referenceNotes: 'Fallback urbano 12m con livrea GTT, usato solo quando il feed non permette di riconoscere la serie.',
  },
};

export function vehicleFleetProfile(fleetKey?: VehicleFleetKey) {
  return VEHICLE_FLEET_PROFILES[fleetKey ?? 'generic-bus'];
}
