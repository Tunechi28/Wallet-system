import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { databaseConfig } from './database.config';

@Module({})
export class DatabaseModule {
  static forRoot(migrations: unknown[]): DynamicModule {
    const dbModule = this.getTypeOrmModule(migrations);

    return {
      module: DatabaseModule,
      imports: [dbModule],
      exports: [dbModule],
    };
  }

  static forFeature(entities: EntityClassOrSchema[]): DynamicModule {
    return TypeOrmModule.forFeature([...entities]);
  }

  private static getTypeOrmModule(migrations: unknown[]): DynamicModule {
    const dbConfig = databaseConfig();
    return TypeOrmModule.forRoot({
      type: 'postgres',
      host: dbConfig?.host,
      port: dbConfig?.port,
      database: dbConfig?.databaseName,
      username: dbConfig?.username,
      password: dbConfig?.password,
      namingStrategy: new SnakeNamingStrategy(),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      migrations: [...migrations],
      migrationsTableName: 'migrations_typeorm',
      migrationsRun: dbConfig?.migration,
      synchronize: dbConfig?.synchronize,
      logging: ['error', 'migration', 'schema'],
      logger: 'simple-console',
      ssl: dbConfig?.ssl,
      autoLoadEntities: true,
    });
  }
}
