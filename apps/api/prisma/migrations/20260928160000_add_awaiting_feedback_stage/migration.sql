-- AlterEnum
-- A proposal that has been sent and is awaiting client feedback is a live
-- state, not an outcome: the client is still inside their normal response
-- window, so the deal must not be collapsed into NO_REPLY.
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'AWAITING_FEEDBACK' BEFORE 'WON';
