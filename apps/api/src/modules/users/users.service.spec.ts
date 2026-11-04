import { searchTerms } from '../../common/sql-search.js';
import { orderBy } from './users.service.js';

describe('liste du personnel : utilitaires SQL', () => {
  it('découpe la recherche et échappe les jokers', () => {
    expect(searchTerms('  Jean   DUPONT ')).toEqual(['%Jean%', '%DUPONT%']);
    expect(searchTerms('100%_x')).toEqual(['%100\\%\\_x%']);
    expect(searchTerms('a b c d e f g')).toHaveLength(5);
    expect(searchTerms('')).toEqual([]);
  });
  it('tri sur liste blanche, toujours départagé par id_user', () => {
    expect(orderBy('nom', 'desc')).toBe('s.nom DESC, s.prenom DESC, s.id_user DESC');
    expect(orderBy(undefined, undefined)).toContain('s.classement');
    expect(orderBy('inconnu' as never, 'asc')).toContain('s.classement');
    for (const s of ['nom', 'nigend', 'unite', 'region', 'profil'] as const) expect(orderBy(s, 'asc')).toMatch(/id_user/);
  });
});
