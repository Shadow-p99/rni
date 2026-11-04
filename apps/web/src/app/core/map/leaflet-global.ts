import * as Lns from 'leaflet';

const g = globalThis as unknown as { L?: typeof Lns };
g.L ??= { ...Lns } as typeof Lns;
