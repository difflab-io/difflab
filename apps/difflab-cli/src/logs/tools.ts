import { z } from 'zod'
import { absolutePath } from 'utils/zodx'
import { defineTool } from '../tools.js'
import { appendProgressLog } from './store.js'

// Constants -------------------------------------------------------------------
const logOutput = z.object({ result: z.object({ path: z.string(), entry: z.string() }) })

// API -------------------------------------------------------------------------
export const logTools = [
  defineTool(
    'log_append',
    {
      description:
        'Append one locally timestamped progress line to logs.txt at an absolute physical path. The parent directory must already exist; create the file if absent, never overwrite prior entries.',
      inputSchema: z.strictObject({
        path: absolutePath.describe(
          'Absolute physical path to an existing plan directory/logs.txt',
        ),
        message: z.string().min(1).describe('Single-line progress message'),
      }),
      outputSchema: logOutput,
      annotations: { openWorldHint: false },
    },
    async ({ path, message }) => appendProgressLog(path, message),
    { toStructuredContent: (result) => ({ result }) },
  ),
]
