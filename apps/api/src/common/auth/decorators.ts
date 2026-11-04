import { SetMetadata } from '@nestjs/common';
import { Profil } from '@rni/shared';

export const PUBLIC_KEY = 'rni:public';
export const ALLOW_UNKNOWN_KEY = 'rni:allowUnknown';
export const PROFILES_KEY = 'rni:profiles';
export const NO_AUDIT_KEY = 'rni:noAudit';

/** Route accessible sans authentification (santé, configuration publique). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** BR-AUTH-2 (exception) : l'utilisateur inconnu n'est pas rejeté (ex. `GET /users/isUser`). */
export const AllowUnknownUser = () => SetMetadata(ALLOW_UNKNOWN_KEY, true);

/** Profils autorisés sur la route (prioritaire sur la règle par défaut). */
export const Profiles = (...profils: Profil[]) => SetMetadata(PROFILES_KEY, profils);

export const ALL_PROFILES: Profil[] = [1, 2, 3, 4, 5, 6, 7];

/** Pas de ligne d'audit Splunk (ex. `/service/alive`). */
export const NoAudit = () => SetMetadata(NO_AUDIT_KEY, true);
