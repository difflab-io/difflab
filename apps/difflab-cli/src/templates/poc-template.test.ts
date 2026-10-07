import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import YAML from 'yaml'
import { embeddedSource } from './source.js'

// Tests -----------------------------------------------------------------------
test('the PoC template records its branch point and learnings', async () => {
  // Arrange
  const template = await embeddedSource.read('poc-readme.md')

  // Act
  const frontmatter = template.match(/^---\n([\s\S]*?)\n---\n/)

  // Assert
  expect(frontmatter?.[1]).toContain('base_commit:')
  expect(template).toContain('## Learnings')
  expect(template).toContain('git diff <base_commit> HEAD')
})

test('the PoC merge check evaluates the PR source ref on all targets', async () => {
  // Arrange
  const workflow = await readFile(
    join(import.meta.dir, '..', '..', '..', '..', '.github', 'workflows', 'block-poc-merge.yml'),
    'utf8',
  )

  // Act
  const parsed = YAML.parse(workflow) as {
    on: { pull_request_target: { types: string[]; branches?: string[] } }
    jobs: {
      'block-poc-source': {
        name: string
        steps: { env: { SOURCE_BRANCH: string }; run: string }[]
      }
    }
  }
  const job = parsed.jobs['block-poc-source']
  const step = job.steps[0]!
  const runForBranch = (branch: string) =>
    spawnSync('bash', ['-e', '-c', step.run], {
      env: { ...process.env, SOURCE_BRANCH: branch },
      encoding: 'utf8',
    }).status

  // Assert
  expect(parsed.on.pull_request_target.branches).toBeUndefined()
  expect(workflow).not.toContain('actions/checkout')
  expect(job.name).toBe('Block PoC source branch')
  expect(step.env.SOURCE_BRANCH).toContain('github.event.pull_request.head.ref')
  expect(runForBranch('poc/experiment')).toBe(1)
  expect(runForBranch('feature/experiment')).toBe(0)
  expect(runForBranch('poc-other')).toBe(0)
})
