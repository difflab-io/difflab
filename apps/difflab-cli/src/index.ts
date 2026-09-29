#!/usr/bin/env bun

import { createProgram } from './cli.js'

const version = process.env.PREMISE_PACKAGE_VERSION ?? '0.1.0'

await createProgram(console.log, version).parseAsync(process.argv)
