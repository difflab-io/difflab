// Constants -------------------------------------------------------------------
const maxAttempts = 10

// API -------------------------------------------------------------------------
/** Retry a fresh operation (not a failed transaction) after transient SQLite contention. */
export async function retryDatabaseOperation<T>(
  work: () => Promise<T>,
  retryable: (error: unknown) => boolean = isSqliteContention,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work()
    } catch (error) {
      if (attempt >= maxAttempts || !retryable(error)) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(20 * 2 ** (attempt - 1), 250) + Math.random() * 20),
      )
    }
  }
}

export function isSqliteContention(error: unknown): boolean {
  return errorChain(error).some(
    (cause) =>
      cause instanceof Error &&
      (/(?:SQLITE_BUSY(?:_SNAPSHOT)?|SQLITE_LOCKED)/i.test(
        String('code' in cause ? cause.code : ''),
      ) ||
        /database (?:is )?locked|database (?:is )?busy|SQLITE_BUSY(?:_SNAPSHOT)?|SQLITE_LOCKED/i.test(
          cause.message,
        )),
  )
}

export function hasMigrationRace(error: unknown): boolean {
  return errorChain(error).some(
    (cause) =>
      cause instanceof Error &&
      (/(?:table ["']?(?:projects|repositories)["']?|index ["']?repositories_project_slug_unique["']?) already exists/i.test(
        cause.message,
      ) ||
        /UNIQUE constraint failed: kysely_migration\.name/i.test(cause.message)),
  )
}

// Helpers ---------------------------------------------------------------------
function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error)
    chain.push(error)
    error = 'cause' in error ? error.cause : undefined
  }
  return chain
}
