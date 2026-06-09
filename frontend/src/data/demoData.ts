import type { Route, Stop, TransitLine, Vehicle } from '../types';

export const userPosition = { lat: 45.0706, lon: 7.6867 };

export const lines: TransitLine[] = [
  { id: '4', name: 'Linea 4', color: '#2F7DFF', direction: 'Falchera', alternateDirection: 'Drosso', routeId: 'route-4', favorite: true, stats: { lengthKm: 17.8, durationMin: 52, tripsToday: 146, firstRun: '05:04', lastRun: '00:38' } },
  { id: '13', name: 'Linea 13', color: '#3DDC84', direction: 'Gran Madre', alternateDirection: 'Campanella', routeId: 'route-13', favorite: true, stats: { lengthKm: 9.6, durationMin: 34, tripsToday: 118, firstRun: '05:18', lastRun: '23:54' } },
  { id: '15', name: 'Linea 15', color: '#FFB020', direction: 'Sassi', alternateDirection: 'Brissogne', routeId: 'route-15', stats: { lengthKm: 11.2, durationMin: 39, tripsToday: 102, firstRun: '05:21', lastRun: '00:10' } },
  { id: '18', name: 'Linea 18', color: '#E85D75', direction: 'Sofia', alternateDirection: 'Caio Mario', routeId: 'route-18', stats: { lengthKm: 13.4, durationMin: 43, tripsToday: 94, firstRun: '05:32', lastRun: '23:45' } },
  { id: '33', name: 'Linea 33', color: '#A36BFF', direction: 'Collegno', alternateDirection: 'Porta Nuova', routeId: 'route-33', stats: { lengthKm: 12.1, durationMin: 41, tripsToday: 76, firstRun: '05:45', lastRun: '23:20' } },
  { id: '56', name: 'Linea 56', color: '#35C2FF', direction: 'Grugliasco', alternateDirection: 'Tabacchi', routeId: 'route-56', stats: { lengthKm: 15.3, durationMin: 48, tripsToday: 84, firstRun: '05:12', lastRun: '00:02' } },
  { id: '68', name: 'Linea 68', color: '#FF7A3D', direction: 'Cafasso', alternateDirection: 'Frejus', routeId: 'route-68', stats: { lengthKm: 10.7, durationMin: 36, tripsToday: 92, firstRun: '05:28', lastRun: '23:58' } },
];

export const stops: Stop[] = [
  { id: 'porta-nuova', name: 'Porta Nuova', lat: 45.0625, lon: 7.6787, lines: ['4', '13', '33'] },
  { id: 'castello', name: 'Piazza Castello', lat: 45.0709, lon: 7.6857, lines: ['4', '13', '15', '56'] },
  { id: 'statuto', name: 'Piazza Statuto', lat: 45.0765, lon: 7.6696, lines: ['13', '56'] },
  { id: 'vittorio', name: 'Piazza Vittorio', lat: 45.0647, lon: 7.6968, lines: ['13', '15', '68'] },
  { id: 'porta-susa', name: 'Porta Susa', lat: 45.0731, lon: 7.6676, lines: ['4', '56'] },
  { id: 'madama', name: 'Madama Cristina', lat: 45.0551, lon: 7.6769, lines: ['18', '68'] },
  { id: 'racconigi', name: 'Racconigi', lat: 45.0747, lon: 7.6507, lines: ['33', '56'] },
  { id: 'sassi', name: 'Sassi', lat: 45.0799, lon: 7.7319, lines: ['15'] },
  { id: 'falchera', name: 'Falchera', lat: 45.1224, lon: 7.7086, lines: ['4'] },
  { id: 'drosso', name: 'Drosso', lat: 45.0041, lon: 7.6225, lines: ['4'] },
  { id: 'caio-mario', name: 'Caio Mario', lat: 45.0269, lon: 7.6407, lines: ['18'] },
  { id: 'tabacchi', name: 'Corso Belgio', lat: 45.0736, lon: 7.7174, lines: ['56'] },
];

export const routes: Route[] = [
  { id: 'route-4', line: '4', stops: ['drosso', 'porta-nuova', 'castello', 'porta-susa', 'falchera'], path: [
    { lat: 45.0041, lon: 7.6225 }, { lat: 45.0269, lon: 7.6407 }, { lat: 45.0456, lon: 7.6622 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0918, lon: 7.6825 }, { lat: 45.1224, lon: 7.7086 },
  ] },
  { id: 'route-13', line: '13', stops: ['statuto', 'castello', 'vittorio'], path: [
    { lat: 45.0765, lon: 7.6696 }, { lat: 45.0737, lon: 7.6772 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0647, lon: 7.6968 },
  ] },
  { id: 'route-15', line: '15', stops: ['vittorio', 'castello', 'sassi'], path: [
    { lat: 45.0647, lon: 7.6968 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0758, lon: 7.7072 }, { lat: 45.0799, lon: 7.7319 },
  ] },
  { id: 'route-18', line: '18', stops: ['caio-mario', 'madama', 'castello'], path: [
    { lat: 45.0269, lon: 7.6407 }, { lat: 45.045, lon: 7.664 }, { lat: 45.0551, lon: 7.6769 }, { lat: 45.0709, lon: 7.6857 },
  ] },
  { id: 'route-33', line: '33', stops: ['racconigi', 'porta-susa', 'porta-nuova'], path: [
    { lat: 45.0747, lon: 7.6507 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0689, lon: 7.6745 }, { lat: 45.0625, lon: 7.6787 },
  ] },
  { id: 'route-56', line: '56', stops: ['racconigi', 'statuto', 'castello', 'tabacchi'], path: [
    { lat: 45.0747, lon: 7.6507 }, { lat: 45.0765, lon: 7.6696 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0736, lon: 7.7174 },
  ] },
  { id: 'route-68', line: '68', stops: ['madama', 'porta-nuova', 'vittorio'], path: [
    { lat: 45.0551, lon: 7.6769 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.0647, lon: 7.6968 },
  ] },
];

export const vehicles: Vehicle[] = [
  { vehicleId: '3278', line: '4', direction: 'Falchera', lat: 45.0703, lon: 7.6869, speed: 32, updatedAt: '09:41:23', status: 'simulated', reliability: 94, progress: 0.48, routeId: 'route-4', favorite: true },
  { vehicleId: '3341', line: '4', direction: 'Drosso', lat: 45.0512, lon: 7.6651, speed: 27, updatedAt: '09:41:19', status: 'simulated', reliability: 91, progress: 0.31, routeId: 'route-4' },
  { vehicleId: '2184', line: '13', direction: 'Gran Madre', lat: 45.0719, lon: 7.6812, speed: 18, updatedAt: '09:41:21', status: 'simulated', reliability: 88, progress: 0.58, routeId: 'route-13', favorite: true },
  { vehicleId: '2290', line: '15', direction: 'Sassi', lat: 45.0753, lon: 7.7094, speed: 35, updatedAt: '09:41:17', status: 'simulated', reliability: 86, progress: 0.72, routeId: 'route-15' },
  { vehicleId: '4107', line: '18', direction: 'Sofia', lat: 45.0539, lon: 7.6746, speed: 24, updatedAt: '09:41:20', status: 'simulated', reliability: 90, progress: 0.44, routeId: 'route-18' },
  { vehicleId: '5632', line: '33', direction: 'Porta Nuova', lat: 45.0713, lon: 7.6611, speed: 21, updatedAt: '09:41:16', status: 'simulated', reliability: 83, progress: 0.51, routeId: 'route-33' },
  { vehicleId: '7810', line: '56', direction: 'Tabacchi', lat: 45.0734, lon: 7.6939, speed: 29, updatedAt: '09:41:22', status: 'simulated', reliability: 92, progress: 0.68, routeId: 'route-56' },
  { vehicleId: '6904', line: '68', direction: 'Cafasso', lat: 45.0617, lon: 7.6887, speed: 16, updatedAt: '09:41:18', status: 'simulated', reliability: 87, progress: 0.63, routeId: 'route-68' },
  { vehicleId: '7055', line: '4', direction: 'Falchera', lat: 45.0921, lon: 7.6837, speed: 38, updatedAt: '09:41:14', status: 'simulated', reliability: 89, progress: 0.79, routeId: 'route-4' },
  { vehicleId: '2488', line: '13', direction: 'Campanella', lat: 45.0669, lon: 7.6915, speed: 22, updatedAt: '09:41:12', status: 'simulated', reliability: 85, progress: 0.83, routeId: 'route-13' },
];
