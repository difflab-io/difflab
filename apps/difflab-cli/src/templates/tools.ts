import { z } from 'zod'
import { fileName, absolutePath, relativePath } from '../extensions/zodx.js'
import { defineTool } from '../tools.js'
import { TemplateService } from './service.js'

// Constants -------------------------------------------------------------------
const templateInfo = z.object({
  name: z.string(),
  description: z.string(),
})
const templateListOutput = z.object({ result: z.array(templateInfo) })
const scaffoldOutput = z.object({
  result: z.object({ name: z.string(), path: z.string() }),
})

// API -------------------------------------------------------------------------
export const templateTools = [
  defineTool(
    'template_list',
    {
      description:
        'List document templates, including flow definitions and instances; install any missing defaults and examples in the user templates directory without overwriting local edits.',
      inputSchema: z.strictObject({}),
      outputSchema: templateListOutput,
      annotations: { openWorldHint: false },
    },
    async () => new TemplateService().listTemplates(),
    { toStructuredContent: (result) => ({ result }) },
  ),
  defineTool(
    'scaffold',
    {
      description:
        'Copy a named installed template into a new file under absolute cwd in relative directory path with the supplied filename. Create missing directories; never overwrite an existing file.',
      inputSchema: z.strictObject({
        name: z
          .string()
          .describe('Hyphenated template name from template_list, such as spec-driven-plan'),
        cwd: absolutePath.describe('Absolute path to an existing destination base directory'),
        path: relativePath.describe(
          'Relative directory inside cwd; use . for cwd itself; missing directories are created',
        ),
        filename: fileName.describe(
          'Name of the new file inside path, such as my-plan.md; no separators',
        ),
      }),
      outputSchema: scaffoldOutput,
      annotations: { openWorldHint: false },
    },
    async ({ name, cwd, path, filename }) => ({
      name,
      path: await new TemplateService().scaffoldFromTemplate(name, cwd, path, filename),
    }),
    { toStructuredContent: (result) => ({ result }) },
  ),
]
