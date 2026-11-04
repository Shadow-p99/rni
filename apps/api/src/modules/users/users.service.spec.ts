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
    expect(orderBy('nom', 'desc')).toEqual([['nom', 'DESC'], ['prenom', 'DESC'], ['id_user', 'DESC']]);
    expect(JSON.stringify(orderBy(undefined, undefined))).toContain('classement');
    expect(JSON.stringify(orderBy('inconnu' as never, 'asc'))).toContain('classement');
    for (const s of ['nom', 'nigend', 'unite', 'region', 'profil'] as const) expect(JSON.stringify(orderBy(s, 'asc'))).toMatch(/id_user/);
  });
});
