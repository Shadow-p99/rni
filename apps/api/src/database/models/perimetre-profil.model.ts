import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** BR-AUTH-6 : périmètre de visualisation par profil et par module (écran Administration). */
@Table({ tableName: 't_perimetre_profil', timestamps: false })
export class PerimetreProfil extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  id_profil: number;

  @PrimaryKey
  @Column(DataType.STRING(16))
  module: string;

  @Column(DataType.STRING(16))
  perimetre: string;

  @Column(DataType.DATE)
  updated_at: Date;

  @Column(DataType.STRING(8))
  updated_by: string | null;
}
