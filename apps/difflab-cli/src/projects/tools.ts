import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { defineTool } from '../tools.js'
import { readProjectContext } from './context.js'

// Constants -------------------------------------------------------------------
const setupHint = 'Use the difflab-init skill to set up this repository with the Difflab CLI.'

// API -------------------------------------------------------------------------
export function createProjectTools(home?: string) {
  return [
    defineTool(
      'project_context',
      {
        description:
          'Read the configured Difflab project and GitHub repository for an existing absolute cwd. Never sets up or modifies a repository.',
        inputSchema: z.strictObject({
          cwd: z.string().refine(isAbsolute, 'cwd must be an absolute existing directory'),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ cwd }) => readProjectContext(cwd, home),
      { errorHint: setupHint },
    ),
  ]
}

export const projectTools = createProjectTools()
