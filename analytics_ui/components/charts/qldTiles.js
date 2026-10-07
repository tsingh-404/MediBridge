// Schematic tiles only. This arrangement is not a Queensland boundary map.
export const QLD_MAP_LABEL = 'Schematic Queensland tile layout; tiles do not show boundaries';

export const QLD_TILE_LAYOUT = Object.freeze([
  { regionCodes: ['Far North Queensland'], label: 'Far North', x: 2, y: 0 },
  { regionCodes: ['North Queensland'], label: 'North', x: 2, y: 1 },
  { regionCodes: ['Central Queensland'], label: 'Central', x: 2, y: 2 },
  { regionCodes: ['Wide Bay'], label: 'Wide Bay', x: 3, y: 3 },
  { regionCodes: ['Sunshine Coast'], label: 'Sunshine Coast', x: 4, y: 3 },
  { regionCodes: ['Brisbane'], label: 'Brisbane', x: 4, y: 4 },
  { regionCodes: ['Darling Downs'], label: 'Darling Downs', x: 3, y: 4 },
  { regionCodes: ['Gold Coast'], label: 'Gold Coast', x: 5, y: 4 },
  { code: 'unknown', label: 'Unknown', x: 6, y: 2, offMap: true },
]);
