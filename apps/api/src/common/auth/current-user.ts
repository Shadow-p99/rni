import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Utilisateur RNI résolu à partir des en-têtes SSO (BR-AUTH-1/2). */
export interface RniUser {
  id_user: number;
  nigend: string;
  grade: string | null;
  nom: string;
  prenom: string;
  displayname: string;
  id_profil: number;
  libelle_profil: string;
  id_region: number | null;
  libelle_region: string | null;
  code_unite: string | null;
  libelle_unite: string | null;
  /** Régions visibles par module (BR-AUTH-6) ; `null` = national. */
  perimetres: { carte: number[] | null; planning: number[] | null };
  geoloc_id_geoloc: string | null;
  geoloc_indicatif: string | null;
  geoloc_bool_geoloc: boolean;
  geoloc_bool_indispo: boolean;
}

export interface RniRequest {
  rniUser?: RniUser | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RniUser | null => {
  return ctx.switchToHttp().getRequest<RniRequest>().rniUser ?? null;
});
