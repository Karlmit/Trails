import { Prisma } from '@prisma/client';

// Postgres SQLSTATEs relevant to the error-translation helpers below. With
// the @prisma/adapter-pg driver adapter, Prisma surfaces the original
// Postgres error as a generic PrismaClientKnownRequestError whose
// `meta.driverAdapterError.cause` carries the raw node-postgres error
// (`code`, `message`, `constraint`, ...).
const POSTGRES_EXCLUSION_VIOLATION = '23P01';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
const POSTGRES_SERIALIZATION_FAILURE = '40001';

const SECTIONS_OVERLAP_CONSTRAINT = 'sections_no_overlap_per_trip';

type DriverCause = { code?: string; message?: string; constraint?: string } | undefined;

function driverCause(err: Prisma.PrismaClientKnownRequestError): DriverCause {
  const meta = err.meta as { driverAdapterError?: { cause?: DriverCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

/**
 * AD-2: a genuine EXCLUDE-constraint violation on `sections_no_overlap_per_trip`.
 * Matches primarily on the Postgres SQLSTATE, but also falls back to the
 * constraint name appearing in the driver error's `constraint` field or its
 * message (and Prisma's own wrapped error message) -- so a real overlap
 * can't be misclassified as an unhandled 500 if the exact error shape
 * varies slightly across driver/Prisma versions.
 */
export function isSectionOverlapViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = driverCause(err);

  if (cause?.code === POSTGRES_EXCLUSION_VIOLATION) return true;
  if (cause?.constraint === SECTIONS_OVERLAP_CONSTRAINT) return true;
  if (typeof cause?.message === 'string' && cause.message.includes(SECTIONS_OVERLAP_CONSTRAINT)) {
    return true;
  }
  if (typeof err.message === 'string' && err.message.includes(SECTIONS_OVERLAP_CONSTRAINT)) {
    return true;
  }
  return false;
}

/**
 * The row targeted by an update/delete no longer exists -- e.g. it was
 * deleted by another request between this request's existence check and its
 * mutation. Prisma's known code for "record to update/delete not found".
 */
export function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/**
 * A foreign-key constraint was violated -- e.g. a Section's parent Trip was
 * deleted between this request's existence check and the Section
 * insert/update. Matches Prisma's own code as well as the raw Postgres
 * SQLSTATE as a fallback.
 */
export function isForeignKeyViolationError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2003') return true;
  return driverCause(err)?.code === POSTGRES_FOREIGN_KEY_VIOLATION;
}

/**
 * A serializable-transaction conflict (concurrent signup bootstrap race).
 * Matches Prisma's own "transaction failed due to a write conflict"
 * code, the raw Postgres SQLSTATE, and -- as a fallback -- Postgres's
 * standard serialization-failure message text.
 */
export function isSerializationFailure(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2034') return true;
  const cause = driverCause(err);
  if (cause?.code === POSTGRES_SERIALIZATION_FAILURE) return true;
  if (typeof cause?.message === 'string' && /could not serialize access/i.test(cause.message)) {
    return true;
  }
  return false;
}
