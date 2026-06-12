import type { Vehicle } from '../types';

const tramLines = new Set(['3', '4', '10', '13', '15']);

function vehicleTypeForLine(line: string): Vehicle['vehicleType'] {
  return tramLines.has(line) ? 'tram' : 'bus';
}

type VehicleSeed = Omit<Vehicle, 'bearing' | 'routeShortName' | 'source' | 'status' | 'vehicleType'> & {
  status: 'simulated';
};

const vehicleSeeds: VehicleSeed[] = [
  { vehicleId: '3278', line: '4', lineId: '4', direction: 'Falchera', lat: 45.0703, lon: 7.6869, speed: 32, updatedAt: '09:41:23', status: 'simulated', reliability: 82, progress: 0.48, routeId: 'route-4', nextStop: 'Falchera', favorite: true },
  { vehicleId: '3410', line: '4', lineId: '4', direction: 'Drosso', lat: 45.0456, lon: 7.6622, speed: 29, updatedAt: '09:41:20', status: 'simulated', reliability: 87, progress: 0.22, routeId: 'route-4', nextStop: 'Porta Nuova' },
  { vehicleId: '7055', line: '4', lineId: '4', direction: 'Falchera', lat: 45.0921, lon: 7.6837, speed: 38, updatedAt: '09:41:14', status: 'simulated', reliability: 89, progress: 0.79, routeId: 'route-4', nextStop: 'Falchera' },
  { vehicleId: '7184', line: '4', lineId: '4', direction: 'Falchera', lat: 45.0041, lon: 7.6225, speed: 34, updatedAt: '09:41:10', status: 'simulated', reliability: 91, progress: 0.04, routeId: 'route-4', nextStop: 'Drosso' },
  { vehicleId: '1194', line: '3', lineId: '3', direction: 'Vallette', lat: 45.0731, lon: 7.6676, speed: 24, updatedAt: '09:41:18', status: 'simulated', reliability: 89, progress: 0.34, routeId: 'route-3', nextStop: 'Porta Susa' },
  { vehicleId: '1208', line: '3', lineId: '3', direction: 'Racconigi', lat: 45.0758, lon: 7.6106, speed: 28, updatedAt: '09:41:08', status: 'simulated', reliability: 86, progress: 0.84, routeId: 'route-3', nextStop: 'Massaua' },
  { vehicleId: '2086', line: '8', lineId: '8', direction: 'Centro', lat: 45.0417, lon: 7.6733, speed: 26, updatedAt: '09:41:17', status: 'simulated', reliability: 88, progress: 0.31, routeId: 'route-8', nextStop: 'Carducci' },
  { vehicleId: '2147', line: '8', lineId: '8', direction: 'Lingotto', lat: 45.0625, lon: 7.6787, speed: 22, updatedAt: '09:41:11', status: 'simulated', reliability: 84, progress: 0.66, routeId: 'route-8', nextStop: 'Porta Nuova' },
  { vehicleId: '2893', line: '11', lineId: '11', direction: 'Centro', lat: 45.0954, lon: 7.7187, speed: 31, updatedAt: '09:41:16', status: 'simulated', reliability: 90, progress: 0.12, routeId: 'route-11', nextStop: 'Rebaudengo' },
  { vehicleId: '2920', line: '11', lineId: '11', direction: 'Piazza Sofia', lat: 45.0709, lon: 7.6857, speed: 25, updatedAt: '09:41:05', status: 'simulated', reliability: 85, progress: 0.72, routeId: 'route-11', nextStop: 'Piazza Castello' },
  { vehicleId: '3612', line: '13', lineId: '13', direction: 'Moncalieri', lat: 45.0512, lon: 7.6651, speed: 28, updatedAt: '09:41', status: 'simulated', reliability: 91, progress: 0.31, routeId: 'route-13', nextStop: 'Moncalieri' },
  { vehicleId: '2488', line: '13', lineId: '13', direction: 'Moncalieri', lat: 45.0669, lon: 7.6915, speed: 22, updatedAt: '09:41:12', status: 'simulated', reliability: 85, progress: 0.83, routeId: 'route-13', nextStop: 'Moncalieri' },
  { vehicleId: '2502', line: '13', lineId: '13', direction: 'Campanella', lat: 45.0765, lon: 7.6696, speed: 20, updatedAt: '09:41:04', status: 'simulated', reliability: 82, progress: 0.08, routeId: 'route-13', nextStop: 'Piazza Statuto' },
  { vehicleId: '2721', line: '15', lineId: '15', direction: 'Alenia', lat: 45.0719, lon: 7.6812, speed: 24, updatedAt: '09:40', status: 'simulated', reliability: 88, progress: 0.58, routeId: 'route-15', nextStop: 'Alenia', favorite: true },
  { vehicleId: '2773', line: '15', lineId: '15', direction: 'Sassi', lat: 45.0799, lon: 7.7319, speed: 27, updatedAt: '09:40:58', status: 'simulated', reliability: 86, progress: 0.91, routeId: 'route-15', nextStop: 'Sassi' },
  { vehicleId: '4178', line: '18', lineId: '18', direction: 'Rebaudengo', lat: 45.0713, lon: 7.6611, speed: 22, updatedAt: '09:39', status: 'simulated', reliability: 83, progress: 0.51, routeId: 'route-18', nextStop: 'Rebaudengo' },
  { vehicleId: '4237', line: '18', lineId: '18', direction: 'Caio Mario', lat: 45.0269, lon: 7.6407, speed: 21, updatedAt: '09:40:55', status: 'simulated', reliability: 87, progress: 0.13, routeId: 'route-18', nextStop: 'Caio Mario' },
  { vehicleId: '4311', line: '18', lineId: '18', direction: 'Centro', lat: 45.0551, lon: 7.6769, speed: 30, updatedAt: '09:40:45', status: 'simulated', reliability: 90, progress: 0.67, routeId: 'route-18', nextStop: 'Piazza Castello' },
  { vehicleId: '4660', line: '35', lineId: '35', direction: 'Valentino', lat: 45.0306, lon: 7.6657, speed: 22, updatedAt: '09:41:13', status: 'simulated', reliability: 89, progress: 0.18, routeId: 'route-35', nextStop: 'Lingotto' },
  { vehicleId: '4682', line: '35', lineId: '35', direction: 'Lingotto', lat: 45.0542, lon: 7.6879, speed: 26, updatedAt: '09:40:57', status: 'simulated', reliability: 84, progress: 0.73, routeId: 'route-35', nextStop: 'Valentino' },
  { vehicleId: '3855', line: '33', lineId: '33', direction: 'Borgata Rosa', lat: 45.0753, lon: 7.7094, speed: 19, updatedAt: '09:40', status: 'simulated', reliability: 86, progress: 0.72, routeId: 'route-33', nextStop: 'Borgata Rosa' },
  { vehicleId: '3922', line: '33', lineId: '33', direction: 'Porta Nuova', lat: 45.0731, lon: 7.6676, speed: 23, updatedAt: '09:40:51', status: 'simulated', reliability: 92, progress: 0.36, routeId: 'route-33', nextStop: 'Porta Susa' },
  { vehicleId: '6120', line: '55', lineId: '55', direction: 'Gran Madre', lat: 45.0736, lon: 7.7174, speed: 21, updatedAt: '09:41:21', status: 'simulated', reliability: 88, progress: 0.11, routeId: 'route-55', nextStop: 'Corso Belgio' },
  { vehicleId: '6188', line: '55', lineId: '55', direction: 'Corso Belgio', lat: 45.0647, lon: 7.6968, speed: 25, updatedAt: '09:41:09', status: 'simulated', reliability: 83, progress: 0.69, routeId: 'route-55', nextStop: 'Piazza Vittorio' },
  { vehicleId: '3124', line: '56', lineId: '56', direction: 'Piazza Sofia', lat: 45.0539, lon: 7.6746, speed: 31, updatedAt: '09:39', status: 'simulated', reliability: 90, progress: 0.44, routeId: 'route-56', nextStop: 'Piazza Sofia' },
  { vehicleId: '3139', line: '56', lineId: '56', direction: 'Tabacchi', lat: 45.0765, lon: 7.6696, speed: 20, updatedAt: '09:40:42', status: 'simulated', reliability: 86, progress: 0.28, routeId: 'route-56', nextStop: 'Piazza Statuto' },
  { vehicleId: '5521', line: '58', lineId: '58', direction: 'Politecnico', lat: 45.0632, lon: 7.6628, speed: 18, updatedAt: '09:41:19', status: 'simulated', reliability: 91, progress: 0.16, routeId: 'route-58', nextStop: 'Politecnico' },
  { vehicleId: '5577', line: '58', lineId: '58', direction: 'Porta Nuova', lat: 45.0679, lon: 7.6754, speed: 24, updatedAt: '09:40:47', status: 'simulated', reliability: 85, progress: 0.52, routeId: 'route-58', nextStop: 'Solferino' },
  { vehicleId: '6304', line: '61', lineId: '61', direction: 'San Mauro', lat: 45.0799, lon: 7.7319, speed: 32, updatedAt: '09:41:15', status: 'simulated', reliability: 87, progress: 0.21, routeId: 'route-61', nextStop: 'Sassi' },
  { vehicleId: '6366', line: '61', lineId: '61', direction: 'Sassi', lat: 45.1035, lon: 7.7664, speed: 29, updatedAt: '09:40:41', status: 'simulated', reliability: 82, progress: 0.86, routeId: 'route-61', nextStop: 'San Mauro' },
  { vehicleId: '2901', line: '4', lineId: '4', direction: 'Falchera', lat: 45.0734, lon: 7.6939, speed: 27, updatedAt: '09:38', status: 'simulated', reliability: 92, progress: 0.68, routeId: 'route-4', nextStop: 'Falchera' },
  { vehicleId: '5256', line: '10', lineId: '10', direction: 'Massaua', lat: 45.0617, lon: 7.6887, speed: 18, updatedAt: '09:38', status: 'simulated', reliability: 87, progress: 0.63, routeId: 'route-10', nextStop: 'Massaua' },
  { vehicleId: '5271', line: '10', lineId: '10', direction: 'Porta Nuova', lat: 45.0758, lon: 7.6106, speed: 28, updatedAt: '09:40:39', status: 'simulated', reliability: 84, progress: 0.23, routeId: 'route-10', nextStop: 'Massaua' },
  { vehicleId: '5308', line: '17', lineId: '17', direction: 'Mirafiori', lat: 45.0306, lon: 7.6657, speed: 21, updatedAt: '09:40:33', status: 'simulated', reliability: 81, progress: 0.41, routeId: 'route-17', nextStop: 'Lingotto' },
  { vehicleId: '5319', line: '17', lineId: '17', direction: 'Rivoli', lat: 45.0551, lon: 7.6769, speed: 27, updatedAt: '09:40:29', status: 'simulated', reliability: 86, progress: 0.76, routeId: 'route-17', nextStop: 'Madama Cristina' },
  { vehicleId: '6812', line: '68', lineId: '68', direction: 'San Mauro', lat: 45.0551, lon: 7.6769, speed: 25, updatedAt: '09:41:07', status: 'simulated', reliability: 90, progress: 0.14, routeId: 'route-68', nextStop: 'Madama Cristina' },
  { vehicleId: '6844', line: '68', lineId: '68', direction: 'Frejus', lat: 45.0647, lon: 7.6968, speed: 23, updatedAt: '09:40:38', status: 'simulated', reliability: 87, progress: 0.88, routeId: 'route-68', nextStop: 'Piazza Vittorio' },
];

export const vehicles: Vehicle[] = vehicleSeeds.map(({ status: _legacyStatus, ...vehicle }) => ({
  ...vehicle,
  bearing: 0,
  routeShortName: vehicle.line,
  source: 'simulation',
  status: 'moving',
  vehicleType: vehicleTypeForLine(vehicle.line),
}));
