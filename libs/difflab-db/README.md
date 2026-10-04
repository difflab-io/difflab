# difflab-db

Internal Bun/TypeScript library for local Difflab Project metadata. Each Project owns a separate SQLite database at `~/.difflab/projects/<project-slug>/db/project.sqlite`. There is no overall database yet.

The CLI imports TypeScript source directly and bundles this library, including statically embedded migration SQL. Users do not need Drizzle Kit, a migration folder, or network access to initialize a Project. Databases and WAL files remain outside the executable.

For a schema change, run `bun run migrations:generate` in this directory and commit the new `drizzle/` files and `src/generated/migrations.ts`. CI checks that the embedded SQL matches the generated migration journal. Run `bun run test` and `bun run lint` before release.
