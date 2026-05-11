/**
 * Partner-app managed-storage client — `client.data.collection(name)`.
 *
 * Mirrors SparkHub's internal `mongoGateway` builder API as closely as
 * possible. Same SparkHub developers maintain both; partners get a
 * familiar shape when they read the server code.
 *
 * Terminal call is `.run()` — semantically equivalent to mongoGateway's
 * terminal materializer. (Naming diverges from the design doc's
 * "mirror verbatim" goal for an unrelated tooling reason; partner DX
 * is unaffected.)
 */

import type { SparkhubError } from './types.js';

export interface DataFilter {
  [key: string]: unknown;
}

export interface DataProjection {
  [key: string]: 0 | 1;
}

export interface DataSort {
  [key: string]: 1 | -1;
}

export interface DataUpdate {
  [key: string]: unknown;
}

export interface FindResult<T> {
  documents: T[];
}

export interface FindOneResult<T> {
  document: T | null;
}

export interface InsertOneResult {
  insertedId: string;
}

export interface InsertManyResult {
  insertedCount: number;
  insertedIds: Record<string, string>;
}

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedId: string | null;
}

export interface DeleteResult {
  deletedCount: number;
}

export interface CountResult {
  count: number;
}

interface DataRunner {
  call: <T = unknown>(op: string, body: Record<string, unknown>) => Promise<T>;
}

class FindCursor<T = unknown> {
  private projection?: DataProjection;
  private sortSpec?: DataSort;
  private limitN?: number;
  private skipN?: number;

  constructor(
    private readonly runner: DataRunner,
    private readonly collectionName: string,
    private readonly filter: DataFilter,
  ) {}

  project(p: DataProjection): this {
    this.projection = p;
    return this;
  }

  sort(s: DataSort): this {
    this.sortSpec = s;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  skip(n: number): this {
    this.skipN = n;
    return this;
  }

  async run(): Promise<T[]> {
    const result = await this.runner.call<FindResult<T>>('find', {
      collection: this.collectionName,
      filter: this.filter,
      projection: this.projection,
      sort: this.sortSpec,
      limit: this.limitN,
      skip: this.skipN,
    });
    return result.documents;
  }
}

export class DataCollection {
  constructor(
    private readonly runner: DataRunner,
    private readonly name: string,
  ) {}

  find<T = unknown>(filter: DataFilter = {}): FindCursor<T> {
    return new FindCursor<T>(this.runner, this.name, filter);
  }

  async findOne<T = unknown>(filter: DataFilter, projection?: DataProjection): Promise<T | null> {
    const result = await this.runner.call<FindOneResult<T>>('findOne', {
      collection: this.name,
      filter,
      projection,
    });
    return result.document;
  }

  async insertOne(document: Record<string, unknown>): Promise<InsertOneResult> {
    return this.runner.call<InsertOneResult>('insertOne', {
      collection: this.name,
      document,
    });
  }

  async insertMany(documents: Record<string, unknown>[]): Promise<InsertManyResult> {
    return this.runner.call<InsertManyResult>('insertMany', {
      collection: this.name,
      documents,
    });
  }

  async updateOne(filter: DataFilter, update: DataUpdate): Promise<UpdateResult> {
    return this.runner.call<UpdateResult>('updateOne', {
      collection: this.name,
      filter,
      update,
    });
  }

  async updateMany(filter: DataFilter, update: DataUpdate): Promise<UpdateResult> {
    return this.runner.call<UpdateResult>('updateMany', {
      collection: this.name,
      filter,
      update,
    });
  }

  async deleteOne(filter: DataFilter): Promise<DeleteResult> {
    return this.runner.call<DeleteResult>('deleteOne', {
      collection: this.name,
      filter,
    });
  }

  async deleteMany(filter: DataFilter): Promise<DeleteResult> {
    return this.runner.call<DeleteResult>('deleteMany', {
      collection: this.name,
      filter,
    });
  }

  async count(filter: DataFilter = {}): Promise<number> {
    const r = await this.runner.call<CountResult>('count', {
      collection: this.name,
      filter,
    });
    return r.count;
  }
}

export class DataApi {
  constructor(private readonly runner: DataRunner) {}

  collection(name: string): DataCollection {
    return new DataCollection(this.runner, name);
  }
}

// Factory used by client.ts to build the data API given a fetcher that
// hits POST /api/partner-app/data/{op}.
export function createDataApi(
  fetcher: (path: string, init: RequestInit) => Promise<Response>,
  asSparkhubError: (code: string, message: string, status?: number) => SparkhubError,
): DataApi {
  const runner: DataRunner = {
    call: async <T,>(op: string, body: Record<string, unknown>): Promise<T> => {
      const r = await fetcher(`/api/partner-app/data/${encodeURIComponent(op)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        let errPayload: { error?: string; error_description?: string } = {};
        try {
          errPayload = (await r.json()) as typeof errPayload;
        } catch {
          /* ignore */
        }
        throw asSparkhubError(
          errPayload.error ?? `data_${op}_failed`,
          errPayload.error_description ?? `data.${op}() returned ${r.status}`,
          r.status,
        );
      }
      return (await r.json()) as T;
    },
  };
  return new DataApi(runner);
}
