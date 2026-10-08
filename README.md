# tarot-draw

Public tarot draw API and single-page web application.

## v1 scope

- Rider-Waite-Smith standard 78 cards plus custom Title and GUARANTEE cards (80 total).
- Server-owned shuffle, upright/reversed orientation, three-way split, branch state, and draw state.
- 27 / 27 / 26 split with independent branches from one split snapshot.
- Optional parallel reading representing "if I had chosen the other pile".
- Arbitrary rectangular n×m reading layout with web-owned row/column labels.
- Result-only display: card identity + orientation + position context.
- One-action bulk copy of the current Primary/Parallel results.
- No tarot meanings or automated interpretation in v1.

## Run

Requires Node.js 22+.

```bash
npm test
npm start
```

Open `http://localhost:3000`.

## API overview

- `POST /api/sessions`
- `POST /api/sessions/:sessionId/shuffle`
- `POST /api/sessions/:sessionId/branches` with `{ "pile": "A" | "B" | "C" }`
- `POST /api/branches/:branchId/draw` with `{ "positions": ["r0c0", ...] }`
- `DELETE /api/sessions/:sessionId`
- `GET /api/health`

The API treats position IDs as opaque strings. Semantic labels such as 過去 / 現在 / 未来 belong to the web UI.

## Specifications

- `docs/SPECIFICATION.md`
- GitHub Issue #2: v1 draw/session behavioral contract
- GitHub Issue #3: v1 single-page reading UI and bulk copy

## GitHub Pages

The static reading UI is published from `web/` through `.github/workflows/pages.yml`.

The Pages build injects an external API configuration from the repository variable `TAROT_API_BASE_URL`. When that variable is empty, the live site intentionally disables shuffle/draw and reports that the API is not connected; it never falls back to client-side authoritative drawing. Local `npm start` continues to use the same-origin Node API.

## Cloudflare API

Production API deployment uses a dedicated Cloudflare Worker (`tarot-draw-api`) with one SQLite-backed Durable Object per reading session. The Durable Object persists the shuffled 80-card snapshot and independent branch cursors; sessions expire after 24 hours of inactivity. Browser CORS is restricted to the GitHub Pages origin. The Worker also uses a Cloudflare Rate Limiting binding.

Deploy with `npm run deploy:cloudflare` after verification. The deployed Worker URL is then configured as the repository variable `TAROT_API_BASE_URL`, which causes the Pages workflow to inject it into `config.js`.


## Reading workspace

The browser UI uses direct table manipulation: rows and columns are added from the matrix itself and can be removed from contextual axis controls before shuffle. Each completed reading keeps its question, matrix, optional Parallel branch and copy action in an append-only in-page history.

Standard 78-card results use the public-domain Pamela Colman Smith Rider-Waite-Smith image set sourced from Wikimedia Commons. Runtime delivery is self-hosted compressed WebP: 128px grid assets and 256px detail assets. The accepted generated set is 7.6 KB average / 11.2 KB maximum for grid images and 25.8 KB average / 41.4 KB maximum for detail images. Reversed cards rotate the artwork 180 degrees while keeping the textual card identity/orientation upright. Title Card and GUARANTEE intentionally use separate non-RWS faces.


## 78-card detail keyword grid (#26)

The card-detail dialog for each standard Rider–Waite–Smith card displays the existing artwork, **five independent Japanese theme headings × four keywords**, and the previously available essence/upright/reversed reference text. The five groups are displayed in five semantic table rows, each row combining a vertical-writing heading and four vertical-writing short terms, always **to the right of the enlarged upper-left card**, including on mobile. The dialog height follows its contents with vertical scrolling where needed, avoiding oversized blank areas. The concise upright/reversed scope explanation and Tarotoo MIT source link live **only in the ⓘ popup**. Essence text remains slightly larger than upright/reversed descriptions. Two original cards (Title / GUARANTEE) deliberately have no tarot keywords. The 80-card draw, API, branch, row/column layout and TSV copy behavior remain unchanged.

The 78 keyword records are newly composed in Japanese using the [Tarotoo Tarot Card Meanings Dataset](https://github.com/Tarotoo-com/tarotoo-tarot-dataset) (MIT, © 2026 Tarotoo) as an English conceptual reference. [Full licence notice](docs/third-party/TAROTOO-LICENSE.txt), [editorial rules](docs/KEYWORD_EDITORIAL_GUIDE.md) and [78-card provenance / QA](docs/KEYWORD_W2_PROVENANCE.md) are preserved in the repository. Third-party concept-map graphics and the likely-transcribed original keyword compilation are **not** included and are not licensed by this feature.

For local browser verification with Chrome/Chromium available, run `node scripts/card-keyword-branch-smoke.mjs`. Normal `npm test`, `npm run check`, and the GitHub CI workflow validate the static data and app behavior. Publication uses the existing Pages workflow after merge; no additional API deployment is required for this presentation-only feature.

### #32: vertical-writing detail table layout

The card detail window now places its **enlarged RWS card at upper left** and its five-by-five keyword table **directly to the right on every screen size** (including phones); it no longer stacks keywords below the image. Each thematic heading and each keyword is written **vertically** within its semantic table cell. The dialog adjusts height to its contents and avoids excessive blank space ahead of the original Essence, upright and reversed descriptions. A visible **「キーワード」** heading is placed immediately above the right-hand table, with an adjacent accessible **ⓘ action** for the short card-wide upright/reversed clarification and the independently edited Tarotoo MIT credit/link, rather than permanent on-page paragraphs. The keyword pane cannot pan horizontally. Existing 78 card meanings/draw behavior and special-card exclusion are unchanged.

### #34: label and contextual explanation

The keyword table is visibly titled **「キーワード」**, and both the table's accessible name and its adjacent ⓘ meaning/source disclosure refer to that same title. Readers can identify the contents before opening help. The left card/right vertically written 5×5 table, reading paragraphs, draw behavior and existing visual geometry remain unchanged. UX acceptance and unverified assistive-device questions are separately recorded in Issue #34, following `kinoko34077/.ai-guidelines#21`.
