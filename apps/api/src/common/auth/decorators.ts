import { SetMetadata } from '@nestjs/common';
import type { DroitCode } from '@rni/shared';

export const PUBLIC_KEY = 'rni:public';
export const ALLOW_UNKNOWN_KEY = 'rni:allowUnknown';
export const DROIT_KEY = 'rni:droit';
export const ANY_PROFILE_KEY = 'rni:anyProfile';
export const NO_AUDIT_KEY = 'rni:noAudit';

/** Route accessible sans authentification (santé, configuration publique). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** BR-AUTH-2 (exception) : l'utilisateur inconnu n'est pas rejeté (ex. `GET /users/isUser`). */
export const AllowUnknownUser = () => SetMetadata(ALLOW_UNKNOWN_KEY, true);

/**
 * Droit exigé sur la route (paramétrable par profil : Administration › Droits). Plusieurs codes :
 * l'un d'eux suffit. Le contrôle fin (portée région / soi / auteur) est fait dans les services.
 */
export const RequireDroit = (...codes: DroitCode[]) => SetMetadata(DROIT_KEY, codes);

/**
 * Écriture ouverte à tout utilisateur habilité (ex. déclaration de son appareil). Sans
 * `@RequireDroit` ni `@AnyProfile`, une route d'écriture est **refusée** (règle sûre par défaut).
 */
export const AnyProfile = () => SetMetadata(ANY_PROFILE_KEY, true);

/** Pas de ligne d'audit Splunk (ex. `/service/alive`). */
export const NoAudit = () => SetMetadata(NO_AUDIT_KEY, true);
