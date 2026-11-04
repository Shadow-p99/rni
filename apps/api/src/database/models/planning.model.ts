import { AutoIncrement, Column, CreatedAt, DataType, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';

/**
 * Plage de planning. Les colonnes générées `slot_debut` / `slot_fin` (index de créneau) ne sont
 * volontairement pas déclarées ici : elles sont calculées par PostgreSQL et lues en SQL.
 */
@Table({ tableName: 'planning', timestamps: true })
export class Planning extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id_planning: number;

  @Column(DataType.INTEGER)
  id_user: number;

  @Column(DataType.DATEONLY)
  date_debut: string;

  @Column(DataType.INTEGER)
  id_creneaux_debut: number;

  @Column(DataType.DATEONLY)
  date_fin: string;

  @Column(DataType.INTEGER)
  id_creneaux_fin: number;

  @Column(DataType.INTEGER)
  id_pos_service: number | null;

  @Column(DataType.STRING(512))
  adresse_temp: string | null;

  @Column(DataType.DOUBLE)
  x_adresse_temp: number | null;

  @Column(DataType.DOUBLE)
  y_adresse_temp: number | null;

  @Column(DataType.STRING(8))
  created_by: string | null;

  @Column(DataType.STRING(8))
  updated_by: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE, field: 'created_at' })
  created_at: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, field: 'updated_at' })
  updated_at: Date;
}
