import type { Route, TransitLine } from '../types';

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

export const lines: TransitLine[] = [
  { id: '4', name: 'Falchera', color: '#2F7DFF', direction: 'Falchera', alternateDirection: 'Drosso', routeId: 'route-4', favorite: true, stats: { lengthKm: 13.2, durationMin: 28, tripsToday: 142, firstRun: '05:10', lastRun: '00:15' } },
  { id: '13', name: 'Moncalieri', color: '#FF8A1F', direction: 'Moncalieri', alternateDirection: 'Campanella', routeId: 'route-13', favorite: true, stats: { lengthKm: 9.6, durationMin: 34, tripsToday: 118, firstRun: '05:18', lastRun: '23:54' } },
  { id: '15', name: 'Alenia', color: '#A36BFF', direction: 'Alenia', alternateDirection: 'Sassi', routeId: 'route-15', stats: { lengthKm: 11.2, durationMin: 39, tripsToday: 102, firstRun: '05:21', lastRun: '00:10' } },
  { id: '18', name: 'Linea 18', color: '#E85D75', direction: 'Sofia', alternateDirection: 'Caio Mario', routeId: 'route-18', stats: { lengthKm: 13.4, durationMin: 43, tripsToday: 94, firstRun: '05:32', lastRun: '23:45' } },
  { id: '33', name: 'Borgata Rosa', color: '#54B84C', direction: 'Borgata Rosa', alternateDirection: 'Porta Nuova', routeId: 'route-33', favorite: true, stats: { lengthKm: 12.1, durationMin: 41, tripsToday: 76, firstRun: '05:45', lastRun: '23:20' } },
  { id: '56', name: 'Piazza Sofia', color: '#35C2FF', direction: 'Piazza Sofia', alternateDirection: 'Tabacchi', routeId: 'route-56', stats: { lengthKm: 15.3, durationMin: 48, tripsToday: 84, firstRun: '05:12', lastRun: '00:02' } },
  { id: '68', name: 'San Mauro', color: '#2F7DFF', direction: 'San Mauro', alternateDirection: 'Frejus', routeId: 'route-68', stats: { lengthKm: 10.7, durationMin: 36, tripsToday: 92, firstRun: '05:28', lastRun: '23:58' } },
  { id: '10', name: 'Massaua', color: '#54B84C', direction: 'Massaua', alternateDirection: 'Porta Nuova', routeId: 'route-13', stats: { lengthKm: 8.9, durationMin: 31, tripsToday: 74, firstRun: '05:40', lastRun: '23:40' } },
  { id: '17', name: 'Mirafiori', color: '#D75BA8', direction: 'Mirafiori', alternateDirection: 'Rivoli', routeId: 'route-18', stats: { lengthKm: 12.8, durationMin: 42, tripsToday: 68, firstRun: '05:34', lastRun: '23:35' } },
];
