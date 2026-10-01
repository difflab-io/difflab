import { lstat, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Resolve a todo file inside an existing cwd, without following symlinks within it. */
export async function resolveTodoPath(cwd: string, path: string): Promise<string> {
  if (!isAbsolute(cwd)) throw new Error('cwd must be an absolute path to an existing directory')
  if (!path.trim() || isAbsolute(path))
    throw new Error('path must be a non-empty relative file path')

  const root = await realpath(cwd)
  if (!(await stat(root)).isDirectory()) throw new Error('cwd must be an existing directory')
  const file = resolve(root, path)
  const inside = relative(root, file)
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error('path must name a file inside cwd; parent traversal outside cwd is not allowed')
  }

  let current = root
  for (const segment of inside.split(sep)) {
    current = join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Symlink paths are not allowed for todo files: ${current}`)
      }
    } catch (error) {
      if (isFileError(error, 'ENOENT')) break
      throw error
    }
  }
  return file
}
