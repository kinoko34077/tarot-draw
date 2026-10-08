# UX persona proxies and externalized machine verification

Owner: tarot-draw #47. Related: roadmap #39, direct editing #46. Authorities: Project Sources 03_Development_Specification_Principles.md §15, 利用者起点 UI-UX 設計原則, .ai-guidelines USABILITY_POLICY.md, devflow #161/#176/#177, .ai-guidelines #23.

## Non-delegation policy

The developer/agent owns every machine-observable verification and must not transfer ordinary manual checks to KiNoTch. The machine must run the app, inspect behavioral/runtime/geometry state, record measurements and exact revision, and upload reproducible evidence. Human attention is exception-only for protected product/security/rights/consent decisions and genuinely subjective human perception not substitutable by machine evidence.

## Persona approximations and limitations

| Proxy model | Automated task | Direct measurements |
|---|---|---|
| 小2視点 / child-like initial use | Observe controls without a learned UI profile | duplicate captions/inputs, count location, actionable target size, visible labels, overflow |
| Beginner initial completion | Type Q/label, edit matrix, shuffle, select, draw, inspect detail | actions, focus preservation, six-card mapping, keyword layout, copy-to-completion distance |
| Intermediate multi-device | Navigate same UI at desktop and 390/320 mobile-emulated widths | hit target geometry, overflow, visual hierarchy |
| Expert repeated 27×2 task | Build 3x9, select two piles, draw 54 cards | action count, results 27+27, two-table scroll burden, localized copy |

These are **scripted proxies**, not genuine observations of children, inexperienced humans or advanced human users. They cannot prove actual comprehension, physical touch/IME dexterity, or screen-reader spoken Japanese; such claims remain UNVERIFIED until appropriate independent evidence exists.

## Execution and results

- Run: node scripts/ux-persona-evidence.mjs --baseline. Outputs ux-persona-evidence.json with individual PASS/FAIL and human-only UNVERIFIED boundaries. Existing known failures do not fail baseline CI; runtime exceptions do.
- Gate: node scripts/ux-persona-evidence.mjs --gate. Outputs the same evidence but exits nonzero on an accepted machine-check FAIL.
- Environment: Node >=22 with a Chrome/Chromium executable. CHROME_BIN overrides the executable; UX_EVIDENCE_PATH overrides JSON path. GitHub CI uploads the JSON even on failures. Evidence references GITHUB_SHA, run mode, timestamp, browser path, scenario, measured observation, expectation, verdict.
- Existing P0/P1, model, keyword-browser and production tests remain mandatory. New evidence complements those tests rather than claiming completeness.

## Proposed metrics and acceptance (baseline calibration, not empirically universal thresholds)

- Critical integrity: correct server result/pile/position mapping on 100% of enumerated deterministic cases; zero unsafe double dispatch in controlled races. 100% is a test-suite criterion, not a measured real-world failure rate.
- Task completion: completed script scenarios / planned scripted scenarios; all required deterministic flows pass. Separate app failures from test-environment failures.
- Interaction economy: number of deliberate task actions, redundant clicks, repeated entries, and navigation-backtrack; compare identical workflows old-vs-new, not arbitrary human response-time claims.
- Spatial effort: pixel distance from the Copy action to its own completion feedback / viewport height; number of independent Primary/Parallel scroll regions; redundant row/column caption+field count.
- Visual semantic structure: keyword grid 5 thematic rows x 5 distinct columns, all internal vertical/horizontal border lines, one integrated table header for keyword+ⓘ, no independent rounded tile gaps; appearance tests are necessary but not sufficient for human comprehension.
- Editing and recovery: focus/selection/IME-safe editing, immutable card result after post-draw label edits, correct TSV update and reversible accidental structural edits.
- Environment: 1440/390/320 viewport measurements; expand to 200/400% zoom, scripted mouse/touch and real device/AT as supported. Browser emulation is not physical device testing.
- Runtime duration: when measured, compare percentiles (p50/p95) with repetitions and matched runner conditions. Never assume numeric human completion times from a script.

## Promotion and evidence boundaries

During each bounded UX PR, prove changed checks fail against prior code and pass after modification, then promote changed checks to --gate. Do not weaken the checks simply to obtain a passing CI result. Upload exact-head JSON, logs, runtime screenshots where appropriate. Report PASS/FAIL/UNVERIFIED/N/A by assertion, not an overall green CI as a proxy for perception. Keep a subtraction ledger: duplicate input widgets removed, redundant status panels gone, independently scrolling duplicate results removed.

Do not silently change D-1 pile-selection semantics, D-2 question persistence/privacy, D-3 server API idempotency, or third-party imagery rights #21. These are separate authorization boundaries.
