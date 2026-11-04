import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** Historique des migrations (écrit par `database/migrator.ts`, lu par le tableau de bord). */
@Table({ tableName: 't_schema_migrations', timestamps: false })
export class SchemaMigration extends Model {
  @PrimaryKey
  @Column(DataType.STRING(128))
  version: string;

  @Column(DataType.CHAR(64))
  checksum: string;

  @Column(DataType.DATE)
  applied_at: Date;

  @Column(DataType.STRING(128))
  applied_by: string;
}
