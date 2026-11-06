# Classic/new lobby parity audit

Classic is the reference, not the new implementation. Unexpected differences are
defects unless explicitly approved. This audit covers the lobby and its
navigation into shared game, replay, and public pages; it does not claim that
all possible browser, network, or game states have been exhausted.

## Method

1. Derive expectations from classic first. Record gestures, cursors, icons,
   colors, feedback, navigation, and resulting state.
2. Replay equivalent scenarios against both clients. Use controlled accounts,
   relationships, tables, themes, and viewport sizes. Cover owner, player,
   spectator, and shadow roles and public, password-protected, full, and running
   tables.
3. Assert outcomes, not just clicks. Shadowing must show the selected player
   immediately and produce the correct viewpoint after starting. Links must open
   the correct destination and render usable content.
4. Test physical interaction boundaries. Supplement semantic locators with
   coordinate clicks, hit-testing, hover/focus checks, and keyboard input. Check
   computed cursors and cursor assets; screenshots alone generally do not
   capture the mouse cursor.
5. Combine visual and behavioral comparisons. Use matched screenshots with
   narrowly defined dynamic masks, plus targeted style and state assertions.
   Neither screenshot comparison nor functional tests alone covers the reports.
6. Prove the checks detect defects. Run new regressions against the broken
   revision before fixing it. Track each case as verified, failed, blocked, or
   untested, never as passed merely because it was visited.

## Coverage and evidence

Statuses describe assertions, not screenshots captured or controls visited. Keep
production interactions confined to shared test accounts and owned tables. Use
disposable local fixtures for destructive and repeatable scenarios.

| Area                | Required observations                                                                                                     | Status                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Table list          | Spectator-cell upper/middle/lower hit regions and cursors; join/watch/resume; control-click copying                       | Verified by `interactionParity`, `features`, and `milestone` browser tests                                |
| Identity styling    | Self/friend computed colors compared directly with classic in both themes; direct online profile links                    | Verified by `interactionParity`                                                                           |
| Password flow       | Classic title/input visibility/focus/cancellation; protected joins and invalid-password handling                          | Verified by `interactionParity` and `features`                                                            |
| Pregame             | Password/rule icons, visible timers, names, current spectators, role controls, option changes                             | Verified by `interactionParity`, `features`, and `screenAudit`                                            |
| Shadowing           | Name-click selection/clear indicator; score tooltip; selected player's actual viewpoint after shuffled seating            | Verified against both clients by `interactionParity`; deterministic remapping covered by connection tests |
| Public destinations | Profile links from both clients, contained score table at 1440/390 pixels, simplified Stats links                         | Verified by `interactionParity` and `features`; external Help content not re-audited                      |
| Chat/social         | Table/private messages, reply routing, friendship changes, drafts, safe rich text, settings persistence                   | Verified by component tests and `features`                                                                |
| Dialogs             | Create/options, settings, replay, resources, keyboard/modal navigation, active-dialog accessibility                       | Verified by `screenAudit` and `features`; not a pixel-by-pixel comparison of every dialog                 |
| History             | On-demand loading, empty/populated views, replay navigation; friends-history entry absent in both clients on current main | Verified by `historyOnDemand`, `screenAudit`, and `features`                                              |
| Responsive layout   | Desktop/mobile layout, light/dark panels, profile overflow, pregame/chat controls                                         | Verified by `classicAppearance`, `interactionParity`, `screenAudit`, and `features`                       |
| Lifecycle           | Start, finish, replay, leave/return, reconnect, authoritative shadow handoff, canceled handoff                            | Verified by `milestone`, `duckPrivacy`, `screenAudit`, `interactionParity`, and connection tests          |

## Confirmed defects and changes

- Restored classic self/friend colors, spectator cursors across the entire cell,
  password prompts and remembered-password selection, and pregame password
  icons.
- Restored name-click shadow selection/clear feedback and the spectator list's
  selected-player annotation. Removed the unrelated pregame profile navigation
  and oversized Shadow button.
- Reproduced a wrong-player shadow after the server shuffled seats. The game
  handoff now obtains authoritative initialization data instead of carrying the
  pregame seat number. Leaving cancels a pending handoff.
- Restored visible table timers, the Characters icon, score tooltips, friend
  progress indicators, direct online profile links, and control-click URL
  copying.
- Reproduced score-table overflow on the shared public profile page. Wide tables
  now scroll within their panel rather than painting over the page background.

The original regressions failed before the corresponding fixes: colors/cursors,
option rendering, password prompt, shadow feedback, actual shuffled viewpoint,
profile containment, direct profile navigation, and control-click behavior.
Matched row/pregame screenshots accompany the browser assertions. Screenshot
capture itself is not counted as verification.

## Coverage limits

- Chromium is the only supported browser and the sole target of this audit and
  the repository browser suite. Other browsers are out of scope, not blockers.
- Classic's bright light-theme identity colors have insufficient text contrast.
  They are deliberately matched rather than silently replaced with darker
  colors. Accessibility assertions for modal screens target the active dialog;
  they do not certify the underlying classic-colored lobby as WCAG-conformant.
- Verification uses disposable local Rust/PostgreSQL/Redis fixtures. No
  production deployment or new production-data audit is implied. OS cursor
  rendering, every possible account/history combination, and exact pixels across
  all platforms remain outside the verified assertions above.

## Completion

- Turn each confirmed defect into a focused regression before fixing it.
- Run relevant component/browser tests, both client builds, and full
  `bash lint.sh`.
- Record observed differences and remaining coverage limits here.
- Commit and publish one PR after the audit and fixes; do not deploy production.
