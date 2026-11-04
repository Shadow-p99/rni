import { MAX_PAGE_SIZE, USER_SORTS, type CreateUserDto, type SortDir, type UpdateUserDto, type UserListQuery, type UserSort } from '@rni/shared';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateUserBody implements CreateUserDto {
  @Matches(/^\d{5,8}$/, { message: 'nigend invalide' })
  nigend: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5, 6, 7, 8])
  id_profil: number;
}

export class UpdateUserBody implements UpdateUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5, 6, 7, 8])
  id_profil?: number;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(32)
  tel_perso?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(2000)
  commentaire?: string | null;
}

export class InfoDeviceBody {
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(64)
  geoloc_id_geoloc: string | null;
}

export class ActivateLocationBody {
  @IsBoolean()
  isIndispo: boolean;

  @IsBoolean()
  value: boolean;
}

/** `GET /users?page=&size=&q=&region=&profil=&sort=&dir=` */
export class UserListQueryParams implements UserListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  region?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  profil?: number;

  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: UserSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: SortDir;
}
