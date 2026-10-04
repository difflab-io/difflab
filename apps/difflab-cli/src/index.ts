#!/usr/bin/env bun

import { MigrationError, ProjectStoreError } from 'difflab-db'
import { createProgram } from './cli.js'
import { DifflabError } from './errors.js'

// Constants -------------------------------------------------------------------
const version = process.env.PREMISE_PACKAGE_VERSION ?? '0.1.0'

// API -------------------------------------------------------------------------
try {
  await createProgram(console.log, version).parseAsync(process.argv)
} catch (error) {
  if (
    !(error instanceof DifflabError) &&
    !(error instanceof ProjectStoreError) &&
    !(error instanceof MigrationError)
  )
    throw error
  console.error(error.message)
  process.exitCode = 1
}
