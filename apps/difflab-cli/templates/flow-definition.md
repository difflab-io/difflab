# {{name}}

## Intent

{{intent}}

## Inputs

| Name  | Required | Default | Description                                |
| ----- | -------- | ------- | ------------------------------------------ |
| input | yes      | —       | Free-form user request; bind as one value. |

## Flags

| Flag            | Default | Capability    | Effect                                                                             |
| --------------- | ------- | ------------- | ---------------------------------------------------------------------------------- |
| --local         | false   | local         | Omit steps with `unless: --local`; never forward to every skill.                   |
| --commit        | false   | local-commit  | Permit only explicitly commit-capable selected steps to make scoped local commits. |
| --remote-review | false   | remote-review | Opt in to remote review with independent forge authorization.                      |

## Steps

### 1. {{step-id}}

- Handler: `plan new`
- When: always
- Unless: never
- Requires: local
- Receives: `{{input}}`
- Produces: `plan_path` (verified path to the created plan)
- Instructions: {{step-instructions}}

### 2. {{next-step-id}}

- Handler: `review new`
- When: `--remote-review`
- Unless: `--local`
- Requires: remote-review
- Receives: `{{steps.step-id.plan_path}}`
- Produces: `review_path` (verified review artifact)
- Instructions: {{step-instructions}}

## Contract

Replace example rows and steps when creating a definition. Use stable unique lower-case hyphenated input and step IDs; output names may also contain underscores (`^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$`). Declare every input, flag, capability, output and condition. `When` and `Unless` accept only `always`, `never`, or one declared flag; no expressions, shell interpolation or implicit flags. The only tokens are `{{input-name}}` and `{{steps.step-id.output-name}}`. A later step can consume only an earlier declared output, verified when that step finishes. Define any remote or commit capability explicitly and require its independent opt-in flag. This file is reusable and has no run state; editing it affects future runs only.
