import { AutoIncrement, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { RefUser } from './ref-user.model.js';

/**
 * Plage de planning. `slot_debut` / `slot_fin` (index de créneau) sont des colonnes **générées**
 * par PostgreSQL : lues et filtrées, jamais écrites (exclues des créations / mises à jour).
 */
@Table({ tableName: 'planning', timestamps: true })
export class Planning extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id_planning: number;

  @ForeignKey(() => RefUser)
  @Column(DataType.INTEGER)
  id_user: number;

  @BelongsTo(() => RefUser, 'id_user')
  user?: RefUser;

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

  @Column({ type: DataType.INTEGER, set() {} })
  slot_debut: number;

  @Column({ type: DataType.INTEGER, set() {} })
  slot_fin: number;

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
