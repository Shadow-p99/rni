import { AdminLog, AdminLogSplunk, AdminMessage, ParamApp } from './admin.models.js';
import { Formulaire } from './formulaire.model.js';
import { PerimetreProfil } from './perimetre-profil.model.js';
import { FormulaireChamp, FormulaireSection, ProfilDroit, ProfilGestion, RefDroit, RefTypeCrise } from './parametrage.models.js';
import { Planning } from './planning.model.js';
import { RefUser } from './ref-user.model.js';
import { SchemaMigration } from './schema-migration.model.js';
import {
  LienDepartementRegion,
  ProfilClassement,
  RefCreneau,
  RefGrade,
  RefPosService,
  RefProfil,
  RefRegion,
  RefUnite,
  RegionCenter,
  RegionVoisine,
} from './referentiel.models.js';
import { AppLog, RequestMetric, UserActivity } from './supervision.models.js';
import { PersonnelRpsi, UserDetail } from './views.models.js';

export {
  FormulaireChamp,
  FormulaireSection,
  ProfilDroit,
  ProfilGestion,
  RefDroit,
  RefTypeCrise,
  AdminLog,
  AdminLogSplunk,
  AdminMessage,
  AppLog,
  Formulaire,
  LienDepartementRegion,
  ParamApp,
  PerimetreProfil,
  PersonnelRpsi,
  Planning,
  ProfilClassement,
  RefCreneau,
  RefGrade,
  RefPosService,
  RefProfil,
  RefRegion,
  RefUnite,
  RefUser,
  RegionCenter,
  RegionVoisine,
  RequestMetric,
  SchemaMigration,
  UserActivity,
  UserDetail,
};

export const ALL_MODELS = [
  RefUser,
  Planning,
  Formulaire,
  ParamApp,
  AdminMessage,
  AdminLog,
  AdminLogSplunk,
  PerimetreProfil,
  RefDroit,
  ProfilDroit,
  ProfilGestion,
  RefTypeCrise,
  FormulaireSection,
  FormulaireChamp,
  RefProfil,
  ProfilClassement,
  RefPosService,
  RefCreneau,
  RefGrade,
  RefRegion,
  RegionVoisine,
  RegionCenter,
  LienDepartementRegion,
  RefUnite,
  AppLog,
  RequestMetric,
  UserActivity,
  UserDetail,
  PersonnelRpsi,
  SchemaMigration,
];
