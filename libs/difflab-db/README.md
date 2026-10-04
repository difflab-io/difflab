# difflab-db

Internal Bun/TypeScript library for project metadata in one user-wide SQLite database. The caller supplies the database path. This library never chooses a home directory, creates parent directories, or scans project folders.

```ts
import { openProjectStore } from 'difflab-db'

const store = await openProjectStore(dbPath)
try {
  const project = await store.createProject('DES', 'Design', ['git@github.com:example/design.git'])
  await store.linkRepository(project.id, 'https://github.com/example/another')
  console.log(await store.listProjects())
  console.log(await store.getProjectById('DES'))
  console.log(await store.inspectProject('DES'))
} finally {
  await store.close()
}
```

`openProjectStore(dbPath, { readonly: true })` opens only an existing, current database. It does not create a database, migration tables, sidecars or directories. Write methods reject calls on a read-only store.

Projects have a validated key and name. Repositories have a UUID, project key, canonical GitHub URL and slug. The database enforces unique project keys, globally unique GitHub URLs and unique slugs within each project. Project creation and its initial repository links commit in one transaction. Linking an existing URL to its current project returns the existing repository; another project cannot claim it.

Kysely migrations are static TypeScript imports in `src/migrations.ts`. The Kysely Migrator applies them on writable open and owns its migration history. No runtime migration files or migration build step are needed for the compiled Bun CLI. To change the schema, add a new named migration to the static provider; do not edit previously shipped migrations. Run `bun run test`, `bun run lint` and `bun run format:check` here before release.
