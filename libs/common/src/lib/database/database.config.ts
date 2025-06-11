export interface IDatabaseConfig {
  host: string;
  port: number;
  databaseName: string;
  username?: string;
  password?: string;
  migration: boolean;
  synchronize: boolean;
  ssl: boolean;
}

const stringToBoolean = (str: string | undefined): boolean => {
  if (!str) {
    return false;
  }

  return str === 'true';
};

export const databaseConfig = (): IDatabaseConfig => {
  const DEFAULT_PORT = 5432;
  const DEFAULT_DATABASE_NAME = 'wallet';

  const {
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_NAME,
    DATABASE_USERNAME,
    DATABASE_PASSWORD,
    DATABASE_SSL,
    DATABASE_MIGRATION,
  } = process.env;

  return {
    host: DATABASE_HOST || 'localhost',
    port: DATABASE_PORT ? parseInt(DATABASE_PORT, 10) : DEFAULT_PORT,
    username: DATABASE_USERNAME,
    password: DATABASE_PASSWORD,
    ssl: stringToBoolean(DATABASE_SSL),
    databaseName: DATABASE_NAME || DEFAULT_DATABASE_NAME,
    migration: stringToBoolean(DATABASE_MIGRATION),
    synchronize: true,
  };
};
