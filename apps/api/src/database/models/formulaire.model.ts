import { FORMULAIRE_FIELDS } from '@rni/shared';
import { AutoIncrement, Column, CreatedAt, DataType, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';

/** Fiche de crise. Les 46 colonnes métier sont déclarées à partir du catalogue partagé. */
@Table({ tableName: 't_formulaire', timestamps: true })
export class Formulaire extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id_formulaire: number;

  @Column(DataType.INTEGER)
  id_user: number;

  @Column(DataType.BOOLEAN)
  is_closed: boolean;

  @Column(DataType.DATE)
  closed_at: Date | null;

  @CreatedAt
  @Column({ type: DataType.DATE, field: 'created_at' })
  created_at: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, field: 'updated_at' })
  updated_at: Date;

  [key: string]: unknown;
}

const typeOf = (kind: string) => {
  switch (kind) {
    case 'note':
      return DataType.SMALLINT;
    case 'text':
    case 'number':
    case 'select':
    case 'phone':
    case 'address':
      return DataType.STRING(512);
    default:
      return DataType.TEXT;
  }
};

for (const def of FORMULAIRE_FIELDS) {
  Column(typeOf(def.kind))(Formulaire.prototype, def.key);
}
Column(DataType.DOUBLE)(Formulaire.prototype, 'terrain_x');
Column(DataType.DOUBLE)(Formulaire.prototype, 'terrain_y');
