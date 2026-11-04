import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Vues SQL en lecture seule (jamais écrites ni synchronisées).
 * `recherche` reprend exactement l'expression des index trigrammes de la table d'origine :
 * PostgreSQL déplie la vue et utilise l'index (`ix_ref_user_search`, `ix_rpsi_search`).
 */

/** Comptes enrichis : profil, classement, grade, unité, département, fuseau, région (`v_user_detail`). */
@Table({ tableName: 'v_user_detail', timestamps: false })
export class UserDetail extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_user: number;

  @Column(DataType.STRING(8)) nigend: string;
  @Column(DataType.INTEGER) id_grade_personnel: number | null;
  @Column(DataType.STRING(128)) grade: string | null;
  @Column(DataType.STRING(128)) nom: string;
  @Column(DataType.STRING(128)) prenom: string;
  @Column(DataType.STRING(10)) code_unite: string | null;
  @Column(DataType.STRING(32)) tel_pro: string | null;
  @Column(DataType.STRING(32)) tel_perso: string | null;
  @Column(DataType.STRING(32)) tel_unite: string | null;
  @Column(DataType.STRING(32)) numero_neo_1: string | null;
  @Column(DataType.STRING(128)) numero_neo_2: string | null;
  @Column(DataType.INTEGER) id_profil: number;
  @Column(DataType.INTEGER) id_region: number | null;
  @Column(DataType.TEXT) commentaire: string | null;
  @Column(DataType.STRING(64)) geoloc_id_geoloc: string | null;
  @Column(DataType.STRING(16)) geoloc_indicatif: string | null;
  @Column(DataType.BOOLEAN) geoloc_bool_geoloc: boolean;
  @Column(DataType.BOOLEAN) geoloc_bool_indispo: boolean;
  @Column(DataType.BOOLEAN) bool_user_inactif: boolean;
  @Column(DataType.STRING(64)) libelle_profil: string;
  @Column(DataType.INTEGER) classement: number;
  @Column(DataType.STRING(16)) abreviation_grade: string | null;
  @Column(DataType.INTEGER) poids_grade: number;
  @Column(DataType.STRING(255)) libelle_unite: string | null;
  @Column(DataType.STRING(512)) adresse_unite: string | null;
  @Column(DataType.DOUBLE) x_unite: number | null;
  @Column(DataType.DOUBLE) y_unite: number | null;
  @Column(DataType.STRING(3)) id_departement: string | null;
  @Column(DataType.STRING(128)) libelle_departement: string | null;
  @Column(DataType.STRING(64)) time_zone: string;
  @Column(DataType.STRING(128)) libelle_region: string | null;
  /** nigend, nom, prénom, code d'unité (recherche). */
  @Column(DataType.TEXT) recherche: string;
}

/** Personnel RPSI candidat à l'habilitation RNI (`v_personnel_to_ref_user`). */
@Table({ tableName: 'v_personnel_to_ref_user', timestamps: false })
export class PersonnelRpsi extends Model {
  @PrimaryKey
  @Column(DataType.STRING(8))
  nigend: string;

  @Column(DataType.STRING(128)) nom: string;
  @Column(DataType.STRING(128)) prenom: string;
  @Column(DataType.INTEGER) id_grade_personnel: number | null;
  @Column(DataType.STRING(128)) grade: string | null;
  @Column(DataType.STRING(16)) abreviation_grade: string | null;
  @Column(DataType.STRING(10)) code_unite: string | null;
  @Column(DataType.STRING(255)) libelle_unite: string | null;
  @Column(DataType.STRING(3)) id_departement: string | null;
  @Column(DataType.INTEGER) id_region: number | null;
  @Column(DataType.STRING(128)) libelle_region: string | null;
  @Column(DataType.STRING(32)) tel_pro: string | null;
  @Column(DataType.STRING(32)) tel_perso: string | null;
  @Column(DataType.STRING(32)) tel_unite: string | null;
  @Column(DataType.STRING(32)) numero_neo_1: string | null;
  @Column(DataType.STRING(128)) numero_neo_2: string | null;
  /** nigend, nom, prénom (recherche). */
  @Column(DataType.TEXT) recherche: string;
}
