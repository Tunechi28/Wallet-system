import { Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EntityManager, ObjectLiteral, Repository } from 'typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

import { getRepository } from './database.helper';

export class BaseRepository<T extends ObjectLiteral> {
  @Inject()
  private readonly moduleRef!: ModuleRef;

  protected readonly entityClassName!: EntityClassOrSchema;

  protected get repository(): Repository<T> {
    return getRepository<T>(this.moduleRef, this.entityClassName);
  }

  async executeInTransaction<R>(
    operations: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    return await this.repository.manager.transaction(
      async (manager) => await operations(manager),
    );
  }
}
