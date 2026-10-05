import { describe, expect, test } from 'bun:test'
import { absolutePath, fileName, relativePath } from './zodx.js'

// Tests -----------------------------------------------------------------------
describe('filesystem Zod schemas', () => {
  test('accepts absolute base paths and relative destination paths', () => {
    expect(absolutePath.safeParse(process.cwd()).success).toBe(true)
    expect(relativePath.safeParse('docs/nested').success).toBe(true)
    expect(relativePath.safeParse('.').success).toBe(true)
  })

  test('rejects invalid paths and file names', () => {
    expect(absolutePath.safeParse('relative').success).toBe(false)
    for (const path of ['', ' ', process.cwd()]) {
      expect(relativePath.safeParse(path).success).toBe(false)
    }
    expect(fileName.safeParse('plan.md').success).toBe(true)
    for (const name of ['', ' ', '.', '..', 'nested/plan.md', 'nested\\plan.md', 'bad\0name']) {
      expect(fileName.safeParse(name).success).toBe(false)
    }
  })
})
