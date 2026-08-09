import type { Vehicle } from '../types';

export function vehicleNumber(vehicleId: string | null) {
  const match = vehicleId?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function isVehicleNumberInRange(vehicleId: string | null, min: number, max: number) {
  const number = vehicleNumber(vehicleId);
  return Boolean(number && number >= min && number <= max);
}

function isBydElectric12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 30, 49) || isVehicleNumberInRange(vehicleId, 9000, 9121);
}

function isMethane12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 9200, 9261);
}

function isIveco12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 3000, 3099);
}

function isMercedes12m(vehicleId: string | null) {
  return isVehicleNumberInRange(vehicleId, 2400, 2499);
}

function isArticulated18m(vehicleId: string | null) {
  return (
    isVehicleNumberInRange(vehicleId, 790, 797) ||
    isVehicleNumberInRange(vehicleId, 800, 874) ||
    isVehicleNumberInRange(vehicleId, 1310, 1313) ||
    isVehicleNumberInRange(vehicleId, 1350, 1396) ||
    isVehicleNumberInRange(vehicleId, 1400, 1404) ||
    isVehicleNumberInRange(vehicleId, 9300, 9356) ||
    isVehicleNumberInRange(vehicleId, 9600, 9727)
  );
}

export function vehicleFleetKey(vehicleId: string | null, vehicleType: Vehicle['vehicleType']): Vehicle['vehicleFleetKey'] {
  if (vehicleType === 'tram') {
    if (isVehicleNumberInRange(vehicleId, 2800, 2902)) return 'tram-serie-2800';
    if (isVehicleNumberInRange(vehicleId, 5000, 5053)) return 'tram-serie-5000';
    if (isVehicleNumberInRange(vehicleId, 6000, 6054)) return 'tram-serie-6000';
    if (isVehicleNumberInRange(vehicleId, 8001, 8070)) return 'tram-serie-8000';
    return 'generic-tram';
  }
  if (isVehicleNumberInRange(vehicleId, 50, 57)) return 'byd-k7-electric-9m';
  if (isVehicleNumberInRange(vehicleId, 60, 81)) return 'indcar-eb6-electric-6m';
  if (isVehicleNumberInRange(vehicleId, 110, 115)) return 'bmc-neocity-9m';
  if (isVehicleNumberInRange(vehicleId, 30, 49)) return 'byd-k9ub-2017-12m';
  if (isVehicleNumberInRange(vehicleId, 9000, 9059)) return 'byd-k9-electric-12m';
  if (isVehicleNumberInRange(vehicleId, 9060, 9121)) return 'byd-k9ud-2023-12m';
  if (isMethane12m(vehicleId)) return 'iia-citymood-cng-12m';
  if (isVehicleNumberInRange(vehicleId, 3000, 3380)) return 'iveco-citelis-12m';
  if (isVehicleNumberInRange(vehicleId, 3400, 3440)) return 'mercedes-conecto-12m-diesel';
  if (isMercedes12m(vehicleId)) return 'mercedes-conecto-12m-cng';
  if (isVehicleNumberInRange(vehicleId, 9400, 9535)) return 'iveco-eway-electric-12m';
  if (isVehicleNumberInRange(vehicleId, 1150, 1168)) return 'iveco-crossway-suburban';
  if (isVehicleNumberInRange(vehicleId, 1310, 1313)) return 'irisbus-citelis-18m';
  if (isVehicleNumberInRange(vehicleId, 1350, 1396)) return 'mercedes-conecto-18m';
  if (isVehicleNumberInRange(vehicleId, 1400, 1404)) return 'man-lions-city-19c-cng';
  if (isVehicleNumberInRange(vehicleId, 9600, 9661)) return 'iveco-eway-electric-18m';
  if (isVehicleNumberInRange(vehicleId, 9700, 9727)) return 'iveco-eway-electric-18m-brt';
  if (isVehicleNumberInRange(vehicleId, 9300, 9356)) return 'iveco-urbanway-cng-18m';
  if (isVehicleNumberInRange(vehicleId, 790, 797) || isVehicleNumberInRange(vehicleId, 800, 874)) return 'irisbus-citelis-18m';
  if (isVehicleNumberInRange(vehicleId, 230, 241)) return 'irisbus-crossway-11m';
  if (isVehicleNumberInRange(vehicleId, 320, 365)) return 'irisbus-crossway-12m';
  if (isVehicleNumberInRange(vehicleId, 366, 406)) return 'iveco-crossway-line-12m';
  if (isVehicleNumberInRange(vehicleId, 601, 650)) return 'iveco-crossway-line-2022-12m';
  if (isVehicleNumberInRange(vehicleId, 651, 692)) return 'iveco-crossway-line-cng-12m';
  if (isVehicleNumberInRange(vehicleId, 500, 502)) return 'irisbus-arway-15m';
  if (isVehicleNumberInRange(vehicleId, 19, 20)) return 'iveco-mago-granturismo-9m';
  return 'generic-bus';
}

// GTT runs buses on tram lines whenever a tram service is suspended, and the
// line's GTFS route type then describes the service rather than the vehicle. A
// substituting bus was typed as a tram, matched no tram series and fell back to
// the one cluster without a render, losing its model, its specifications and
// its own render in the process.
//
// The fleet numbering makes this recoverable: no number belongs to both a tram
// and a bus cluster, so a recognised number identifies the type on its own. The
// line still decides whenever the number means nothing to us.
export function vehicleTypeForFleetNumber(vehicleId: string | null): Vehicle['vehicleType'] | undefined {
  if (!vehicleId || !/^\d{1,4}$/.test(vehicleId)) return undefined;
  const isTram = vehicleFleetKey(vehicleId, 'tram') !== 'generic-tram';
  const isBus = vehicleFleetKey(vehicleId, 'bus') !== 'generic-bus';
  if (isTram === isBus) return undefined;
  return isTram ? 'tram' : 'bus';
}

export function recognizedFleetNumber(vehicleId: string, vehicleType: Vehicle['vehicleType']) {
  if (!/^\d{1,4}$/.test(vehicleId)) return undefined;
  const key = vehicleFleetKey(vehicleId, vehicleType);
  return key === 'generic-bus' || key === 'generic-tram' ? undefined : vehicleId;
}

export function vehicleLengthClass(vehicleId: string | null, vehicleType: Vehicle['vehicleType']): Vehicle['vehicleLengthClass'] {
  if (vehicleType !== 'bus') return 'standard';
  return isArticulated18m(vehicleId) ? 'articulated-18m' : 'standard';
}

export function vehicleLiveryForVehicle(routeId: string, line: string, vehicleId: string | null): Vehicle['vehicleLivery'] {
  const number = vehicleNumber(vehicleId);
  if (isBydElectric12m(vehicleId)) return 'electric-compact';
  if (isVehicleNumberInRange(vehicleId, 9400, 9727)) return 'electric-compact';
  if (number && number >= 50 && number <= 81) return 'electric-compact';

  const routeNumber = Number(routeId.replace(/U$/, '').replace(/\D/g, '') || line.replace(/\D/g, ''));
  return routeNumber >= 1000 ? 'interurban-blue' : 'urban';
}

export function vehicleFleetLabel(
  vehicleId: string | null,
  vehicleType: Vehicle['vehicleType'],
  livery?: Vehicle['vehicleLivery'],
  lengthClass?: Vehicle['vehicleLengthClass'],
) {
  if (vehicleType === 'tram') {
    if (isVehicleNumberInRange(vehicleId, 2800, 2902)) return 'Tram serie 2800';
    if (isVehicleNumberInRange(vehicleId, 5000, 5053)) return 'Tram serie 5000';
    if (isVehicleNumberInRange(vehicleId, 6000, 6054)) return 'Tram serie 6000 Cityway';
    if (isVehicleNumberInRange(vehicleId, 8001, 8070)) return 'Tram serie 8000 Hitachi';
    return 'Tram';
  }
  if (isVehicleNumberInRange(vehicleId, 9300, 9356)) return 'Iveco Urbanway 18m CNG';
  if (isVehicleNumberInRange(vehicleId, 9600, 9661)) return 'Iveco E-Way 18m elettrico';
  if (isVehicleNumberInRange(vehicleId, 9700, 9727)) return 'Iveco E-Way 18m elettrico BRT';
  if (isVehicleNumberInRange(vehicleId, 9400, 9535)) return 'Iveco E-Way 12m elettrico';
  if (isVehicleNumberInRange(vehicleId, 30, 49)) return 'BYD K9UB elettrico 12m (2017)';
  if (isVehicleNumberInRange(vehicleId, 9000, 9059)) return 'BYD K9UB-DW elettrico 12m';
  if (isVehicleNumberInRange(vehicleId, 9060, 9121)) return 'BYD K9UD elettrico 12m';
  if (isVehicleNumberInRange(vehicleId, 50, 57)) return 'BYD K7 elettrico 9m';
  if (isVehicleNumberInRange(vehicleId, 60, 81)) return 'INDCAR e-B6 elettrico 6m';
  if (isVehicleNumberInRange(vehicleId, 110, 115)) return 'BMC Neocity 9m';
  if (isMethane12m(vehicleId)) return 'IIA Citymood CNG 12m';
  if (isIveco12m(vehicleId)) return 'Irisbus/Iveco Citelis 12m';
  if (isVehicleNumberInRange(vehicleId, 790, 797) || isVehicleNumberInRange(vehicleId, 800, 874)) return 'Irisbus Citelis 18m';
  if (isVehicleNumberInRange(vehicleId, 1310, 1313)) return 'Irisbus Citelis 18m CNG';
  if (isVehicleNumberInRange(vehicleId, 1350, 1396)) return 'Mercedes Conecto 18m';
  if (isVehicleNumberInRange(vehicleId, 1400, 1404)) return "MAN Lion's City 19C CNG";
  if (isMercedes12m(vehicleId)) return 'Mercedes Conecto 12m CNG';
  if (isVehicleNumberInRange(vehicleId, 3400, 3440)) return 'Mercedes Conecto 12m diesel';
  if (isVehicleNumberInRange(vehicleId, 1150, 1168)) return 'Iveco Crossway suburbano';
  if (isVehicleNumberInRange(vehicleId, 230, 241)) return 'Irisbus Crossway 10,6m';
  if (isVehicleNumberInRange(vehicleId, 320, 365)) return 'Irisbus Crossway 12m';
  if (isVehicleNumberInRange(vehicleId, 366, 406)) return 'Iveco Crossway LE 12m (2019)';
  if (isVehicleNumberInRange(vehicleId, 601, 650)) return 'Iveco Crossway 12m (2022)';
  if (isVehicleNumberInRange(vehicleId, 651, 692)) return 'Iveco Crossway Line CNG 12m';
  if (isVehicleNumberInRange(vehicleId, 500, 502)) return 'Irisbus Arway 15m';
  if (isVehicleNumberInRange(vehicleId, 19, 20)) return 'Iveco Mago 2 granturismo';
  if (livery === 'electric-compact') return 'Bus elettrico';
  if (livery === 'interurban-blue') return lengthClass === 'articulated-18m' ? 'Bus suburbano blu 18m' : 'Bus suburbano blu';
  return lengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus';
}
