import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { assertCurrentSchema, migrate, MigrationError } from './migrations.js'

// Tests -----------------------------------------------------------------------
test('applies embedded migration, preserves existing data, and reopens without changing it', () => {
  const database = new Database(':memory:')
  database.run('CREATE TABLE existing_notes (text TEXT NOT NULL)')
  database.query('INSERT INTO existing_notes (text) VALUES (?)').run('keep me')

  migrate(database)
  migrate(database)
  assertCurrentSchema(database)

  expect(database.query('SELECT * FROM existing_notes').all()).toEqual([{ text: 'keep me' }])
  expect(database.query('SELECT * FROM difflab_migrations').all()).toHaveLength(1)
  database.close()
})

test('rejects a changed checksum without reapplying migrations', () => {
  const database = new Database(':memory:')
  migrate(database)
  database.run("UPDATE difflab_migrations SET hash = 'tampered'")

  expect(() => migrate(database)).toThrow(MigrationError)
  expect(() => assertCurrentSchema(database)).toThrow('does not match')
  database.close()
})

test('rolls back failed SQL without advancing version or deleting user data', () => {
  const database = new Database(':memory:')
  database.run('CREATE TABLE project_info (wrong TEXT)')
  database.run('CREATE TABLE user_notes (text TEXT)')
  database.query('INSERT INTO user_notes (text) VALUES (?)').run('kept')

  expect(() => migrate(database)).toThrow('Could not apply project migration')
  expect(
    (database.query('PRAGMA user_version').get() as { user_version: number }).user_version,
  ).toBe(0)
  expect(database.query('SELECT * FROM difflab_migrations').all()).toEqual([])
  expect(database.query('SELECT * FROM user_notes').all()).toEqual([{ text: 'kept' }])
  database.close()
})

test('rejects newer versions without modifying the database', () => {
  const database = new Database(':memory:')
  database.run('PRAGMA user_version = 100')
  expect(() => migrate(database)).toThrow('Unknown project schema version')
  expect(
    database.query("SELECT name FROM sqlite_master WHERE name = 'difflab_migrations'").all(),
  ).toEqual([])
  database.close()
})
