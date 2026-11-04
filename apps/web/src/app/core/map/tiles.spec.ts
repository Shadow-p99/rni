import { tileUrl } from './tiles';

describe('tileUrl (BR-CAR-1)', () => {
  it('laisse les URL XYZ intactes', () => {
    expect(tileUrl({ id: 'osm', label: 'OSM', type: 'xyz', url: 'https://t/{z}/{x}/{y}.png' })).toBe('https://t/{z}/{x}/{y}.png');
  });
  it('construit une requête WMTS KVP (token conservé, matrixSet du fond)', () => {
    const u = tileUrl({ id: 'x_NEO2', label: 'NEO', type: 'wmts', url: 'https://facade/wmts?token=abc', layer: 'L1', matrixSet: 'default028mm', format: 'image/jpeg' });
    expect(u.startsWith('https://facade/wmts?token=abc&SERVICE=WMTS&REQUEST=GetTile')).toBe(true);
    expect(u).toContain('TILEMATRIXSET=default028mm');
    expect(u).toContain('TILEMATRIX={z}&TILEROW={y}&TILECOL={x}');
    expect(u).toContain('FORMAT=image%2Fjpeg');
  });
});
