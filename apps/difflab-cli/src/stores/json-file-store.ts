import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

// Types -----------------------------------------------------------------------
export class JsonFileStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export class JsonFileStoreReadError extends JsonFileStoreError {}
export class JsonFileStoreNotFoundError extends JsonFileStoreReadError {}
export class JsonFileStoreWriteError extends JsonFileStoreError {}
export class JsonFileStoreValidationError extends JsonFileStoreError {}
export class JsonFileStoreMissingItemError extends JsonFileStoreReadError {}

export type JsonItem = { id: string }
type Options = { itemsKey?: string; metadata?: Record<string, unknown> }

type Envelope = Record<string, unknown>

// API -------------------------------------------------------------------------
export class JsonFileStore<T extends JsonItem> {
  readonly file: string
  private readonly itemsKey?: string
  private readonly metadata: Record<string, unknown>
  private envelopeMetadata: Record<string, unknown> = {}

  constructor(
    file: string,
    private readonly schema: z.ZodType<T>,
    options?: Options,
  ) {
    this.file = resolve(file)
    this.itemsKey = options?.itemsKey
    this.metadata = options?.metadata ?? {}
  }

  async read(id: string): Promise<T> {
    const item = (await this.list()).find((candidate) => candidate.id === id)
    if (!item) throw new JsonFileStoreMissingItemError(`Item does not exist: ${id}`)
    return item
  }

  async list(): Promise<T[]> {
    const envelope = await this.load()
    const raw = this.itemsKey ? envelope[this.itemsKey] : envelope
    if (!Array.isArray(raw)) {
      throw new JsonFileStoreValidationError(`Invalid JSON store at ${this.file}`)
    }
    const items = raw.map((item) => this.parse(item))
    this.validateUniqueIds(items)
    return items
  }

  async write(item: T): Promise<void> {
    const value = this.parse(item)
    const items = await this.list()
    const index = items.findIndex((candidate) => candidate.id === value.id)
    if (index === -1) items.push(value)
    else items[index] = value
    await this.persist(items)
  }

  async replace(items: T[]): Promise<void> {
    const validated = items.map((item) => this.parse(item))
    this.validateUniqueIds(validated)
    await this.persist(validated)
  }

  async update(id: string, mutation: (item: T) => T | void): Promise<T> {
    const items = await this.list()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) throw new JsonFileStoreMissingItemError(`Item does not exist: ${id}`)
    const current = items[index]
    const updated = this.parse(mutation(current) ?? current)
    items[index] = updated
    this.validateUniqueIds(items)
    await this.persist(items)
    return updated
  }

  async initialize(items: T[] = []): Promise<boolean> {
    await mkdir(dirname(this.file), { recursive: true })
    const validated = items.map((item) => this.parse(item))
    this.validateUniqueIds(validated)
    try {
      await writeFile(this.file, this.serialize(validated), { flag: 'wx', mode: 0o600 })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw new JsonFileStoreWriteError(`Could not write JSON file: ${this.file}`, { cause: error })
    }
  }

  private async load(): Promise<Envelope> {
    let content: string
    try {
      content = await readFile(this.file, 'utf8')
    } catch (error) {
      const ErrorType =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? JsonFileStoreNotFoundError
          : JsonFileStoreReadError
      throw new ErrorType(`Could not read JSON file: ${this.file}`, { cause: error })
    }
    try {
      const parsed: unknown = JSON.parse(content)
      if (!this.itemsKey) return parsed as Envelope
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Envelope must be an object')
      const envelope = parsed as Envelope
      for (const [key, value] of Object.entries(this.metadata)) {
        if (envelope[key] !== value) throw new Error(`Invalid metadata: ${key}`)
      }
      const metadata = { ...envelope }
      delete metadata[this.itemsKey]
      this.envelopeMetadata = metadata
      return envelope
    } catch (error) {
      if (error instanceof JsonFileStoreValidationError) throw error
      throw new JsonFileStoreValidationError(`Invalid JSON store at ${this.file}`, { cause: error })
    }
  }

  private parse(value: unknown): T {
    try {
      return this.schema.parse(value)
    } catch (error) {
      throw new JsonFileStoreValidationError(`Invalid item for ${this.file}`, { cause: error })
    }
  }

  private validateUniqueIds(items: T[]): void {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      throw new JsonFileStoreValidationError(`Invalid item IDs for ${this.file}`)
    }
  }

  private serialize(items: T[]): string {
    const payload = this.itemsKey
      ? { ...this.envelopeMetadata, ...this.metadata, [this.itemsKey]: items }
      : items
    return `${JSON.stringify(payload, null, 2)}\n`
  }

  private async persist(items: T[]): Promise<void> {
    const temp = `${this.file}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, this.serialize(items), { mode: 0o600 })
      await rename(temp, this.file)
    } catch (error) {
      throw new JsonFileStoreWriteError(`Could not write JSON file: ${this.file}`, { cause: error })
    } finally {
      await rm(temp, { force: true })
    }
  }
}
