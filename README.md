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
