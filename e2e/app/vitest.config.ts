import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { suiteConfig } from '../common/config.js'

export default suiteConfig(dirname(fileURLToPath(import.meta.url)))
