import { Column, DataType, Model, PrimaryKey, AutoIncrement, Table, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({ tableName: 'ref_user', timestamps: true })
export class RefUser extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id_user: number;

  @Column(DataType.STRING(8))
  nigend: string;

  @Column(DataType.INTEGER)
  id_grade_personnel: number | null;

  @Column(DataType.STRING(128))
  grade: string | null;

  @Column(DataType.STRING(128))
  nom: string;

  @Column(DataType.STRING(128))
  prenom: string;

  @Column(DataType.STRING(10))
  code_unite: string | null;

  @Column(DataType.STRING(32))
  tel_pro: string | null;

  @Column(DataType.STRING(32))
  tel_perso: string | null;

  @Column(DataType.STRING(32))
  tel_unite: string | null;

  @Column(DataType.STRING(32))
  numero_neo_1: string | null;

  @Column(DataType.STRING(128))
  numero_neo_2: string | null;

  @Column(DataType.INTEGER)
  id_profil: number;

  @Column(DataType.INTEGER)
  id_region: number | null;

  @Column(DataType.TEXT)
  commentaire: string | null;

  @Column(DataType.STRING(64))
  geoloc_id_geoloc: string | null;

  @Column(DataType.STRING(16))
  geoloc_indicatif: string | null;

  @Column(DataType.BOOLEAN)
  geoloc_bool_geoloc: boolean;

  @Column(DataType.BOOLEAN)
  geoloc_bool_indispo: boolean;

  @Column(DataType.BOOLEAN)
  bool_user_inactif: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE, field: 'created_at' })
  created_at: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, field: 'updated_at' })
  updated_at: Date;
}
