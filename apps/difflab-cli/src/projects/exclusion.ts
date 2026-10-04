import { appendFile, mkdir, readFile, rmdir } from 'node:fs/promises'
import { ProjectSetupError } from '../errors.js'

// API -------------------------------------------------------------------------
export async function hasLocalExclusion(path: string): Promise<boolean> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
  return text.split(/\r?\n/).includes('/.difflab')
}

export async function addLocalExclusion(path: string): Promise<void> {
  const lock = `${path}.difflab-lock`
  let acquired = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await mkdir(lock)
      acquired = true
      break
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      await new Promise((done) => setTimeout(done, 50))
    }
  }
  if (!acquired) throw new ProjectSetupError(`Git exclude is locked at ${lock}`)
  try {
    if (await hasLocalExclusion(path)) return
    let existing = ''
    try {
      existing = await readFile(path, 'utf8')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    await appendFile(path, `${existing && !existing.endsWith('\n') ? '\n' : ''}/.difflab\n`, {
      mode: 0o600,
    })
  } finally {
    await rmdir(lock)
  }
}
