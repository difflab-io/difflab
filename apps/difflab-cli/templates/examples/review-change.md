# Review: invitation acceptance

- **Revision:** illustrative-change-17
- **Intent:** Accept a valid invitation and reject an expired one without changing membership.
- **Reviewer:** Authored example, not an executed review.

This is a fictional example. A real review must use its runtime model name in attribution.

## Intent Delivery

The change adds an acceptance path. Helper tests do not establish that the request saves membership or leaves it unchanged on rejection.

## Readability

`loadInvitation` consumes the token and creates membership. I suggest `acceptInvitation` so callers can see the write.

## Semantic Organization

The handler maps HTTP to the service. The store owns persistence. No refactor is needed here.

## Maintainability

The change follows the existing store pattern and reuses invitation status.

## Reliability/Testing

Helper tests do not prove that acceptance saves membership. Let's add application scenarios for acceptance and rejection, then read membership back.

Repeated setup and nested assertions hide the scenario in `service.spec.ts:18`. I suggest a fixture and separate blocks:

```ts
describe('acceptInvitation', () => {
  test('rejects an expired invitation without adding membership', async () => {
    // Arrange
    const { service, members, recipient, expiredToken } = await invitationFixture()

    // Act
    const acceptance = service.acceptInvitation(expiredToken, recipient.id)

    // Assert
    await expect(acceptance).rejects.toThrow(InvitationExpiredError)
    expect(await members.list(recipient.id)).toEqual([])
  })
})
```

The fixture creates a real test store. I recommend keeping the action and assertions visible and reusing shared setup.

## Repository Guidance

The fictional `AGENTS.md` requires Arrange/Act/Assert blocks and local helpers at the bottom. I suggest separating the mixed steps in `service.spec.ts:18`.

## Performance

SKIPPED: no concrete performance regression is shown and no deep performance audit was requested.

## Security

SKIPPED: no concrete security defect is shown; an exhaustive security audit is outside this example's scope.

## Change Requests

### src/invitations/service.ts:42 — Name the state-changing operation

- **Status:** open
- **Request:** `loadInvitation` also writes membership. I suggest renaming it to `acceptInvitation` and updating callers.

> Generated via [actual model name from runtime]

### src/invitations/service.spec.ts:18 — Expose the scenario and test its public result

- **Status:** open
- **Request:** I suggest the fixture and Arrange/Act/Assert blocks above. Let's add acceptance/rejection scenarios that check saved membership, not just helpers.

> Generated via [actual model name from runtime]

## Findings

| Severity | Location | Evidence and impact | Required change or question |
| --- | --- | --- | --- |
| consider | `src/invitations/service.ts:42` | A query-like name hides token consumption and membership creation. | I suggest renaming the operation and callers. |
| consider | `src/invitations/service.spec.ts:18` | Repeated setup hides the action; helper coverage does not establish saved membership or rejection behavior. | I suggest clear blocks, a fixture, and a public/application scenario. |

## Overall Assessment

I recommend clearer API naming and acceptance/rejection scenarios. No private-helper coverage or speculative clock-skew request is needed.

## Verification and Limits

- **Checks run:** none; this is an authored example, not a report of passing tests.
- **Not verified:** execution, actual repository guidance, real email delivery, and production behavior.
