import { z } from "zod";

/**
 * Shared list pagination.
 *
 * Every list endpoint previously returned the whole table. That is fine for a
 * demo seed and wrong for the 1000+ clients the UI itself expects, so the
 * endpoints take a bounded page. The default is deliberately generous and the
 * ceiling hard, so a client that never sends `limit` still works exactly as
 * before while nothing can ask for the entire table at once.
 */
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 500;

const limitField = z.coerce.number().int().min(1).max(MAX_LIMIT).optional();
const offsetField = z.coerce.number().int().min(0).optional();

export const paginationSchema = z.object({
  limit: limitField,
  offset: offsetField,
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/** Resolves a query into Prisma `take`/`skip`. */
export function pageOf(query: PaginationQuery): { take: number; skip: number } {
  return { take: query.limit ?? DEFAULT_LIMIT, skip: query.offset ?? 0 };
}
