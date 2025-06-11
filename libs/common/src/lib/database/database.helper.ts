import { ModuleRef } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { ObjectLiteral, Repository, TreeRepository } from 'typeorm';

export const getTreeRepository = <entityType extends ObjectLiteral>(
  moduleRef: ModuleRef,
  entity: EntityClassOrSchema,
): TreeRepository<entityType> => {
  const getCurrentRepositoryToken = getRepositoryToken(entity);
  return moduleRef.get<TreeRepository<entityType>>(getCurrentRepositoryToken, {
    strict: false,
  });
};

export const getRepository = <entityType extends ObjectLiteral>(
  moduleRef: ModuleRef,
  entity: EntityClassOrSchema,
): Repository<entityType> => {
  const getCurrentRepositoryToken = getRepositoryToken(entity);

  return moduleRef.get<Repository<entityType>>(getCurrentRepositoryToken, {
    strict: false,
  });
};
