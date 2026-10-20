# Review: invitation acceptance

- **Revision:** illustrative-change-17
- **Intent:** Accept a valid invitation and reject an expired one without changing membership.
- **Reviewer:** Authored example, not an executed review.

The paths, code, repository rule, and observations below are fictional. Attribution placeholders show where a real review must use its runtime model name.

## Intent Delivery

The change adds an acceptance path. Helper tests do not establish that the request saves membership or leaves it unchanged on rejection.

## Readability

At `src/invitations/service.ts:42`, `loadInvitation` also consumes the token and creates membership. Callers cannot recognize a state-changing acceptance from that name. Rename the operation to `acceptInvitation` and update its callers.

## Semantic Organization

The handler calls the invitation service and maps its result to HTTP. Persistence stays behind the existing store API; no additional boundary change is needed in this example.

## Maintainability

The change reuses the store and existing invitation status. No redundant acceptance flag or new fixture framework is needed.

## Reliability/Testing

The added tests exercise `isExpired` and token parsing separately. None accepts an invitation through the application or verifies saved membership through the module API. Add a request scenario for acceptance and rejection, then read membership back. Do not add more helper tests to stand in for this contract.

At `src/invitations/service.spec.ts:18`, each case repeats user/project/token setup and calls acceptance inside a nested assertion. A fixture and distinct blocks make the scenario visible:

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

The fixture creates a real isolated test store and returns public APIs. It does not mock acceptance or hide the assertions. Use a shared fixture only where scenarios actually share setup; otherwise keep its helper in this file.

## Repository Guidance

The fictional root `AGENTS.md` requires distinct Arrange/Act/Assert blocks and single-file helpers at the bottom. The test at `service.spec.ts:18` mixes these steps. Apply the fixture/block correction above and keep its local helper at the bottom. No nested guidance applies in this example.

## Performance

SKIPPED: no concrete performance regression is shown and no deep performance audit was requested.

## Security

SKIPPED: no concrete security defect is shown; an exhaustive security audit is outside this example's scope.

## Change Requests

### src/invitations/service.ts:42 — Name the state-changing operation

- **Status:** open
- **Request:** `loadInvitation` consumes the token and creates membership. Rename it to `acceptInvitation` and update callers so they can see the write in the API.

> Generated via [actual model name from runtime]

### src/invitations/service.spec.ts:18 — Expose the scenario and test its public result

- **Status:** open
- **Request:** Replace repeated setup and the nested action/assertion with the fixture and Arrange/Act/Assert structure above. Verify that an expired acceptance leaves membership empty through the public store API. Add an application request scenario for successful acceptance and rejection; existing helper tests do not prove this contract.

> Generated via [actual model name from runtime]

## Findings

| Severity | Location                             | Evidence and impact                                                                                         | Required change or question                                               |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| consider | `src/invitations/service.ts:42`      | A query-like name hides token consumption and membership creation.                                          | Rename the acceptance operation and callers.                              |
| consider | `src/invitations/service.spec.ts:18` | Repeated setup hides the action; helper coverage does not establish saved membership or rejection behavior. | Use readable blocks and fixtures; verify the public/application contract. |

## Overall Assessment

Address the misleading API and the missing acceptance/rejection contract. No private-helper coverage or speculative clock-skew request is needed.

## Verification and Limits

- **Checks run:** none; this is an authored example, not a report of passing tests.
- **Not verified:** execution, actual repository guidance, real email delivery, and production behavior.
