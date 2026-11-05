import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** Catalogue des droits (`ref_droit`) : libellés et portées proposées, cf. @rni/shared/droits. */
@Table({ tableName: 'ref_droit', timestamps: false })
export class RefDroit extends Model {
  @PrimaryKey
  @Column(DataType.STRING(64))
  code: string;

  @Column(DataType.STRING(16))
  module: string;

  @Column(DataType.STRING(128))
  libelle: string;

  @Column(DataType.STRING(512))
  description: string | null;

  @Column(DataType.ARRAY(DataType.STRING(16)))
  portees: string[];

  @Column(DataType.INTEGER)
  ordre: number;
}

/** Droit accordé à un profil, avec sa portée ; ligne absente = refusé. */
@Table({ tableName: 't_profil_droit', timestamps: false })
export class ProfilDroit extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil: number;

  @PrimaryKey
  @Column(DataType.STRING(64))
  code_droit: string;

  @Column(DataType.STRING(16))
  portee: string;

  @Column(DataType.DATE)
  updated_at: Date;

  @Column(DataType.STRING(8))
  updated_by: string | null;
}

/** Gestion du personnel : profils listés (`visible`) et gérés (`gerable`) par un profil. */
@Table({ tableName: 't_profil_gestion', timestamps: false })
export class ProfilGestion extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil: number;

  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil_cible: number;

  @Column(DataType.BOOLEAN)
  visible: boolean;

  @Column(DataType.BOOLEAN)
  gerable: boolean;

  @Column(DataType.DATE)
  updated_at: Date;

  @Column(DataType.STRING(8))
  updated_by: string | null;
}

@Table({ tableName: 'ref_type_crise', timestamps: false })
export class RefTypeCrise extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id_type_crise: number;

  @Column(DataType.STRING(128))
  libelle: string;

  @Column(DataType.INTEGER)
  ordre: number;

  @Column(DataType.BOOLEAN)
  is_actif: boolean;
}

@Table({ tableName: 't_formulaire_section', timestamps: false })
export class FormulaireSection extends Model {
  @PrimaryKey
  @Column(DataType.STRING(16))
  id_section: string;

  @Column(DataType.STRING(128))
  libelle: string;

  @Column(DataType.BOOLEAN)
  imprimable: boolean;

  @Column(DataType.INTEGER)
  ordre: number;
}

@Table({ tableName: 't_formulaire_champ', timestamps: false })
export class FormulaireChamp extends Model {
  @PrimaryKey
  @Column(DataType.STRING(64))
  cle: string;

  @Column(DataType.STRING(128))
  libelle: string;

  @Column(DataType.BOOLEAN)
  obligatoire: boolean;

  @Column(DataType.INTEGER)
  ordre: number;
}
