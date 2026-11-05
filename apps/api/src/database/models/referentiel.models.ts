import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** Référentiels (lecture ; alimentés par les scripts d'initialisation ou le flux RH). */

@Table({ tableName: 'ref_profil', timestamps: false })
export class RefProfil extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil: number;

  @Column(DataType.STRING(4))
  code: string | null;

  @Column(DataType.STRING(64))
  libelle: string;

  @Column(DataType.BOOLEAN)
  has_planning: boolean;
}

@Table({ tableName: 't_profil_classement', timestamps: false })
export class ProfilClassement extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil: number;

  @Column(DataType.INTEGER)
  classement: number;
}

@Table({ tableName: 'ref_pos_service', timestamps: false })
export class RefPosService extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_pos_service: number;

  @Column(DataType.STRING(64))
  libelle: string;

  @Column(DataType.STRING(9))
  color: string;

  @Column(DataType.BOOLEAN)
  is_actif: boolean;

  @Column(DataType.BOOLEAN)
  is_restreinte: boolean;

  @Column(DataType.SMALLINT)
  priorite_cluster: number | null;
}

@Table({ tableName: 'ref_creneaux', timestamps: false })
export class RefCreneau extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_creneau: number;

  @Column(DataType.STRING(32))
  libelle: string;

  @Column(DataType.SMALLINT)
  heure_debut: number;

  @Column(DataType.SMALLINT)
  heure_fin: number;
}

@Table({ tableName: 'ref_grade_personnel', timestamps: false })
export class RefGrade extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_grade_personnel: number;

  @Column(DataType.STRING(128))
  libelle: string;

  @Column(DataType.STRING(16))
  abreviation: string | null;

  @Column(DataType.INTEGER)
  poids: number;
}

@Table({ tableName: 'ref_regions', timestamps: false })
export class RefRegion extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_region: number;

  @Column(DataType.STRING(128))
  libelle: string;
}

/** Régions limitrophes (BR-AUTH-6). */
@Table({ tableName: 'ref_nrb_region_r22', timestamps: false })
export class RegionVoisine extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_region: number;

  @PrimaryKey
  @Column(DataType.INTEGER)
  id_region_voisine: number;
}

@Table({ tableName: 't_region_center', timestamps: false })
export class RegionCenter extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_region: number;

  @Column(DataType.DOUBLE)
  x: number;

  @Column(DataType.DOUBLE)
  y: number;

  @Column(DataType.SMALLINT)
  zoom: number;
}

@Table({ tableName: 'lien_departement_region', timestamps: false })
export class LienDepartementRegion extends Model {
  @PrimaryKey
  @Column(DataType.STRING(3))
  id_departement: string;

  @Column(DataType.STRING(128))
  libelle_departement: string;

  @Column(DataType.INTEGER)
  id_region: number;

  @Column(DataType.STRING(64))
  dept_time_zone_database: string;
}

@Table({ tableName: 'ref_unite', timestamps: false })
export class RefUnite extends Model {
  @PrimaryKey
  @Column(DataType.STRING(10))
  code_unite: string;

  @Column(DataType.STRING(255))
  libelle: string;

  @Column(DataType.STRING(512))
  adresse: string | null;

  @Column(DataType.DOUBLE)
  x: number | null;

  @Column(DataType.DOUBLE)
  y: number | null;

  @Column(DataType.STRING(3))
  id_departement: string | null;

  @Column(DataType.STRING(32))
  tel_unite: string | null;
}
