import type { Route, TransitLine } from '../types';

export const routes: Route[] = [
  { id: 'route-3', line: '3', stops: ['racconigi', 'porta-susa', 'politecnico', 'massaua'], path: [
    { lat: 45.0747, lon: 7.6507 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0632, lon: 7.6628 }, { lat: 45.0715, lon: 7.6334 }, { lat: 45.0758, lon: 7.6106 },
  ] },
  { id: 'route-4', line: '4', stops: ['drosso', 'porta-nuova', 'castello', 'porta-susa', 'falchera'], path: [
    { lat: 45.0041, lon: 7.6225 }, { lat: 45.0269, lon: 7.6407 }, { lat: 45.0456, lon: 7.6622 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0918, lon: 7.6825 }, { lat: 45.1224, lon: 7.7086 },
  ] },
  { id: 'route-8', line: '8', stops: ['lingotto', 'carducci', 'madama', 'porta-nuova'], path: [
    { lat: 45.0306, lon: 7.6657 }, { lat: 45.0417, lon: 7.6733 }, { lat: 45.0551, lon: 7.6769 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.071, lon: 7.685 },
  ] },
  { id: 'route-10', line: '10', stops: ['massaua', 'porta-susa', 'politecnico', 'porta-nuova'], path: [
    { lat: 45.0758, lon: 7.6106 }, { lat: 45.0715, lon: 7.6334 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0632, lon: 7.6628 }, { lat: 45.0625, lon: 7.6787 },
  ] },
  { id: 'route-11', line: '11', stops: ['sofia', 'rebaudengo', 'castello', 'solferino'], path: [
    { lat: 45.0954, lon: 7.7187 }, { lat: 45.1043, lon: 7.7079 }, { lat: 45.0872, lon: 7.6962 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0679, lon: 7.6754 },
  ] },
  { id: 'route-13', line: '13', stops: ['statuto', 'castello', 'vittorio'], path: [
    { lat: 45.0765, lon: 7.6696 }, { lat: 45.0737, lon: 7.6772 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0647, lon: 7.6968 },
  ] },
  { id: 'route-15', line: '15', stops: ['vittorio', 'castello', 'sassi'], path: [
    { lat: 45.0647, lon: 7.6968 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0758, lon: 7.7072 }, { lat: 45.0799, lon: 7.7319 },
  ] },
  { id: 'route-17', line: '17', stops: ['massaua', 'lingotto', 'carducci', 'madama'], path: [
    { lat: 45.0758, lon: 7.6106 }, { lat: 45.052, lon: 7.6262 }, { lat: 45.0306, lon: 7.6657 }, { lat: 45.0417, lon: 7.6733 }, { lat: 45.0551, lon: 7.6769 },
  ] },
  { id: 'route-18', line: '18', stops: ['caio-mario', 'madama', 'castello'], path: [
    { lat: 45.0269, lon: 7.6407 }, { lat: 45.045, lon: 7.664 }, { lat: 45.0551, lon: 7.6769 }, { lat: 45.0709, lon: 7.6857 },
  ] },
  { id: 'route-35', line: '35', stops: ['lingotto', 'caio-mario', 'valentino', 'madama'], path: [
    { lat: 45.0306, lon: 7.6657 }, { lat: 45.0269, lon: 7.6407 }, { lat: 45.0399, lon: 7.6543 }, { lat: 45.0542, lon: 7.6879 }, { lat: 45.0551, lon: 7.6769 },
  ] },
  { id: 'route-33', line: '33', stops: ['racconigi', 'porta-susa', 'porta-nuova'], path: [
    { lat: 45.0747, lon: 7.6507 }, { lat: 45.0731, lon: 7.6676 }, { lat: 45.0689, lon: 7.6745 }, { lat: 45.0625, lon: 7.6787 },
  ] },
  { id: 'route-55', line: '55', stops: ['tabacchi', 'castello', 'vittorio', 'gran-madre'], path: [
    { lat: 45.0736, lon: 7.7174 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0647, lon: 7.6968 }, { lat: 45.062, lon: 7.7019 },
  ] },
  { id: 'route-56', line: '56', stops: ['racconigi', 'statuto', 'castello', 'tabacchi'], path: [
    { lat: 45.0747, lon: 7.6507 }, { lat: 45.0765, lon: 7.6696 }, { lat: 45.0709, lon: 7.6857 }, { lat: 45.0736, lon: 7.7174 },
  ] },
  { id: 'route-58', line: '58', stops: ['politecnico', 'solferino', 'porta-nuova'], path: [
    { lat: 45.0632, lon: 7.6628 }, { lat: 45.0679, lon: 7.6754 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.056, lon: 7.6902 },
  ] },
  { id: 'route-61', line: '61', stops: ['sassi', 'gran-madre', 'san-mauro'], path: [
    { lat: 45.0799, lon: 7.7319 }, { lat: 45.062, lon: 7.7019 }, { lat: 45.0824, lon: 7.7384 }, { lat: 45.1035, lon: 7.7664 },
  ] },
  { id: 'route-68', line: '68', stops: ['madama', 'porta-nuova', 'vittorio'], path: [
    { lat: 45.0551, lon: 7.6769 }, { lat: 45.0625, lon: 7.6787 }, { lat: 45.0647, lon: 7.6968 },
  ] },
];

export const lines: TransitLine[] = [
  { id: '3', name: 'Vallette', color: '#1D4ED8', direction: 'Vallette', alternateDirection: 'Racconigi', routeId: 'route-3', stats: { lengthKm: 9.4, durationMin: 31, tripsToday: 96, firstRun: '05:08', lastRun: '00:04' } },
  { id: '4', name: 'Falchera', color: '#2F7DFF', direction: 'Falchera', alternateDirection: 'Drosso', routeId: 'route-4', favorite: true, stats: { lengthKm: 13.2, durationMin: 28, tripsToday: 142, firstRun: '05:10', lastRun: '00:15' } },
  { id: '8', name: 'Lingotto', color: '#0EA5E9', direction: 'Centro', alternateDirection: 'Lingotto', routeId: 'route-8', stats: { lengthKm: 8.6, durationMin: 27, tripsToday: 112, firstRun: '05:20', lastRun: '23:58' } },
  { id: '11', name: 'Rebaudengo', color: '#F59E0B', direction: 'Centro', alternateDirection: 'Piazza Sofia', routeId: 'route-11', stats: { lengthKm: 11.7, durationMin: 37, tripsToday: 104, firstRun: '05:18', lastRun: '00:01' } },
  { id: '13', name: 'Moncalieri', color: '#FF8A1F', direction: 'Moncalieri', alternateDirection: 'Campanella', routeId: 'route-13', favorite: true, stats: { lengthKm: 9.6, durationMin: 34, tripsToday: 118, firstRun: '05:18', lastRun: '23:54' } },
  { id: '15', name: 'Alenia', color: '#A36BFF', direction: 'Alenia', alternateDirection: 'Sassi', routeId: 'route-15', stats: { lengthKm: 11.2, durationMin: 39, tripsToday: 102, firstRun: '05:21', lastRun: '00:10' } },
  { id: '18', name: 'Linea 18', color: '#E85D75', direction: 'Sofia', alternateDirection: 'Caio Mario', routeId: 'route-18', stats: { lengthKm: 13.4, durationMin: 43, tripsToday: 94, firstRun: '05:32', lastRun: '23:45' } },
  { id: '35', name: 'Valentino', color: '#10B981', direction: 'Valentino', alternateDirection: 'Lingotto', routeId: 'route-35', stats: { lengthKm: 7.8, durationMin: 25, tripsToday: 88, firstRun: '05:44', lastRun: '23:35' } },
  { id: '33', name: 'Borgata Rosa', color: '#54B84C', direction: 'Borgata Rosa', alternateDirection: 'Porta Nuova', routeId: 'route-33', favorite: true, stats: { lengthKm: 12.1, durationMin: 41, tripsToday: 76, firstRun: '05:45', lastRun: '23:20' } },
  { id: '55', name: 'Gran Madre', color: '#EF4444', direction: 'Gran Madre', alternateDirection: 'Corso Belgio', routeId: 'route-55', stats: { lengthKm: 8.1, durationMin: 29, tripsToday: 92, firstRun: '05:24', lastRun: '23:48' } },
  { id: '56', name: 'Piazza Sofia', color: '#35C2FF', direction: 'Piazza Sofia', alternateDirection: 'Tabacchi', routeId: 'route-56', stats: { lengthKm: 15.3, durationMin: 48, tripsToday: 84, firstRun: '05:12', lastRun: '00:02' } },
  { id: '58', name: 'Politecnico', color: '#6366F1', direction: 'Politecnico', alternateDirection: 'Porta Nuova', routeId: 'route-58', stats: { lengthKm: 6.9, durationMin: 22, tripsToday: 118, firstRun: '05:31', lastRun: '00:06' } },
  { id: '61', name: 'San Mauro', color: '#14B8A6', direction: 'San Mauro', alternateDirection: 'Sassi', routeId: 'route-61', stats: { lengthKm: 12.5, durationMin: 40, tripsToday: 80, firstRun: '05:36', lastRun: '23:42' } },
  { id: '68', name: 'San Mauro', color: '#2F7DFF', direction: 'San Mauro', alternateDirection: 'Frejus', routeId: 'route-68', stats: { lengthKm: 10.7, durationMin: 36, tripsToday: 92, firstRun: '05:28', lastRun: '23:58' } },
  { id: '10', name: 'Massaua', color: '#54B84C', direction: 'Massaua', alternateDirection: 'Porta Nuova', routeId: 'route-10', stats: { lengthKm: 8.9, durationMin: 31, tripsToday: 74, firstRun: '05:40', lastRun: '23:40' } },
  { id: '17', name: 'Mirafiori', color: '#D75BA8', direction: 'Mirafiori', alternateDirection: 'Rivoli', routeId: 'route-17', stats: { lengthKm: 12.8, durationMin: 42, tripsToday: 68, firstRun: '05:34', lastRun: '23:35' } },
];
