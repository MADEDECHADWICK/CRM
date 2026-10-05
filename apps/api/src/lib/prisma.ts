import "dotenv/config"; // must be first — populates process.env before PrismaPg reads DATABASE_URL
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Pool and transaction timings are deliberately generous, because the
 * database is not local. DATABASE_URL points at Neon's pooled (PgBouncer)
 * endpoint in us-east-2, so every statement is a round trip over the internet
 * and a brand new socket costs a TCP + TLS + auth handshake.
 *
 * Measured against this endpoint: ~250ms for a warm query, 2.3s for a cold
 * connection, and over 15s when Neon's compute has been suspended and is
 * resuming for the request.
 *
 * Prisma's default maxWait for interactive transactions is 2000ms, and it
 * starts that clock *before* the driver adapter asks the pool for a
 * connection — not just before queueing behind a busy one. So any transaction
 * that happens to need a fresh socket fails with
 *
 *   P2028 Transaction API error: Unable to start a transaction in the given time.
 *
 * even though Postgres is perfectly healthy. That is a client-side budget that
 * is wrong for a remote database, not a database problem.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Same reasoning one layer down: give a slow or resuming socket room to
  // finish instead of failing it. Kept at or above maxWait so a genuine
  // connect failure surfaces as a driver timeout with an honest message
  // rather than as a misleading P2028.
  connectionTimeoutMillis: 30_000,
  // Keep sockets warm between requests. pg defaults to 10s, which means a
  // quiet API still pays a full cold connect on the next transaction, which is
  // the case that was actually breaking.
  idleTimeoutMillis: 60_000,
});

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    // Time allowed to acquire a connection before Prisma gives up with P2028.
    // Must cover a cold TLS handshake to Neon, not merely pool contention.
    maxWait: 30_000,
    // How long the body of an interactive transaction may run once it has
    // started. The defaults are 2s/5s, which do not leave room for a
    // multi-statement transaction whose statements each cost a WAN round trip.
    timeout: 20_000,
  },
});