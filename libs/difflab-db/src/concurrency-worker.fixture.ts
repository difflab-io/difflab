import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { openProjectStore } from './index.js'

// API -------------------------------------------------------------------------
const [dbPath, marker, mode, index] = process.argv.slice(2)
if (!dbPath || !marker || !mode || !index) throw new Error('Missing concurrency worker arguments')

const store = mode === 'link' ? await openProjectStore(dbPath) : undefined
try {
  await writeFile(`${marker}.${index}.ready`, '')
  const deadline = Date.now() + 15_000
  while (!existsSync(marker)) {
    if (Date.now() > deadline) throw new Error('Worker start timed out')
    await Bun.sleep(10)
  }
  const writer = store ?? (await openProjectStore(dbPath))
  try {
    const result =
      mode === 'create'
        ? await writer.createProject(`PRJ${index.padStart(2, '0')}`, `Project ${index}`)
        : await writer.linkRepository('BASE', 'https://github.com/org/shared')
    console.log(JSON.stringify(result))
  } finally {
    if (!store) await writer.close()
  }
} finally {
  if (store) await store.close()
}
