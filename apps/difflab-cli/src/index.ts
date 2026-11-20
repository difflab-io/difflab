#!/usr/bin/env bun

import { configureAppLogger } from 'utils/logx'
import { createProgram } from './cli.js'

// Constants -------------------------------------------------------------------
const version = process.env.PREMISE_PACKAGE_VERSION ?? '0.1.0'

// API -------------------------------------------------------------------------
try {
  configureAppLogger()
  await createProgram(console.log, version).parseAsync(process.argv)
} catch (error) {
  if (!(error instanceof Error)) throw error
  console.error(error.message)
  process.exitCode = 1
}
