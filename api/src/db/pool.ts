import pg from 'pg';

// DATE (oid 1082) vira string 'YYYY-MM-DD': evita o deslocamento de fuso que o driver faz ao criar um Date.
pg.types.setTypeParser(1082, (value) => value);
// NUMERIC (oid 1700) vira number: os valores do CRM cabem com folga na precisão de um double.
pg.types.setTypeParser(1700, (value) => Number(value));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function withTransaction<T>(db: Db, work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
