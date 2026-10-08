# Initial Specification

## Scope

Build a tarot draw system split into an authoritative draw API and a web UI.

## Deck

- Base: standard Rider-Waite-Smith 78 cards.
- Custom additions: Title Card and GUARANTEE, for 80 total cards.
- Title Card is a distinct custom card conceptually before The Fool (0).
- GUARANTEE is a distinct custom card conceptually after The World (21), associated with 22.
- Both custom cards support upright/reversed orientation.
- No special weighting, guaranteed appearance, forced placement, or extra-draw behavior is specified for either custom card in v1.

## API responsibilities

- Own authoritative deck/session state.
- Shuffle card order.
- Fix upright/reversed orientation as part of shuffled deck state.
- Split the shuffled 80-card deck into three piles while preserving order within each pile.
- Accept pile choice and create an independent branch from the split snapshot.
- Support a second branch from the same split snapshot for "if I had chosen the other pile" parallel reading.
- Draw cards without duplication from the selected branch/pile.
- Return position identifiers mapped to card identifiers and orientation.
- Return a defined insufficient-cards error rather than silently drawing from another pile.
- Do not own semantic spread labels such as past/present/future or advice.

## Web responsibilities

- Present shuffle and three-way-cut interaction.
- Let the user choose a primary pile and optionally a second parallel pile.
- Define arbitrary rectangular n×m layouts.
- Let users label rows and columns freely, e.g. past/present/future, case A/case B, advice.
- Map UI positions to opaque position IDs sent to the API.
- Display returned card identity and upright/reversed orientation.
- Card meanings and interpretation are out of scope for v1.

## Core model

Card catalog -> deck session -> shuffle (order + orientation fixed) -> three-way split snapshot -> branch(es) -> draw(position IDs) -> site layout/display.

## Non-goals for v1

- Automated tarot interpretation or generated reading text.
- A static display-only 78-card reference dataset is allowed only for user-invoked card detail UI; it must not alter draw results.
- Special draw probability for Title or GUARANTEE.
- Fixed named spreads as API concepts.


## Web interaction extensions

- Matrix size is edited by direct row/column add controls on the table rather than numeric dimension fields.
- A specific row or column can be removed through a contextual axis menu. Long-press is supported for touch/pointer use, with conventional desktop alternatives.
- Each reading owns a visible question string rendered as `Q.` before the matrix and included in that reading's copied output.
- Completed readings remain visible in page order. Creating a new reading appends another independent reading workspace below prior results.
- Copy output remains tabular TSV and conditionally appends structural notes for Title Card and/or GUARANTEE when those cards actually occurred.
- Standard 78-card results may display public-domain Rider-Waite-Smith artwork; orientation applies visually to the artwork while the card name/orientation text remains readable.
- Title Card and GUARANTEE do not borrow Rider-Waite imagery and use distinct non-RWS faces.
- Image loading is presentation-only and must not alter or block the authoritative API draw result.


## Card detail reference extension

- Standard 78-card results may expose a user-invoked detail popup containing static reference text.
- The reference text source is the user-supplied `タロット78枚_意味と画像索引.md` dataset, normalized as `essence`, `upright`, and `reversed`.
- Card detail reference data is presentation-only. It must not affect shuffle, orientation, pile selection, draw order, branch state, copy matrix semantics, or probability.
- Title Card and GUARANTEE are outside that 78-card source and must not be assigned invented divinatory meanings.
- Rider-Waite-Smith source artwork remains the public-domain Wikimedia Commons set, but runtime card delivery uses generated self-hosted WebP assets.
- Matrix card assets are 128px WebP with a generation target of 24 KiB; the accepted generated set records average 7,648 bytes and maximum 11,228 bytes.
- Detail card assets are 256px WebP, loaded only when the detail view opens, with a generation target of 56 KiB; the accepted generated set records average 25,824 bytes and maximum 41,416 bytes.
- Runtime image delivery must remain presentation-only and must not affect authoritative draw/session behavior.


## Compact ruby names (Issue #22)

- For standard Minor Arcana, display suits as `杖《ワンド》`, `盃《カップ》`, `剣《ソード》`, `金貨《ペンタクル》`.
- Display ranks as `一《エース》`, numerals 2–10, `小姓《ペイジ》`, `騎士《ナイト》`, `女王《クイーン》`, `王《キング》`.
- `aozora-wasm 0.5.0` renders Aozora notation to ruby HTML in a generation step. The checked-in 56-card mapping is display-only and imported in the browser, without a runtime WASM dependency.
- Plain-text TSV copying preserves row/column geometry and uses Japanese base names with parenthesized katakana readings.
- The existing public-domain RWS images, existing card-detail popup artwork, and draw/API/session semantics are unaffected.
- Third-party concept/reference images from Issue #21 are explicitly excluded from this release while usage rights remain unverified.


## 78-card keyword quick-reference (#26)

- A user-invoked standard-card detail dialog displays the existing self-hosted public-domain RWS WebP art at the upper left and exactly **five thematic heading columns, four Japanese short terms under each**, to its right (5×4 = 20 terms per standard card). The original essence, upright and reversed paragraphs remain below the grid without modifications.
- The complete 78-record static `card_id` map is assembled by `web/card-keyword-grid.js` from its five initial records and `web/card-keyword-corpus.js` (73 additional independently authored Japanese records). Its keys match `src/cards.js`; Title Card and GUARANTEE carry **no** invented meaning/keyword data.
- Display headings and terms are independently authored in Japanese using [Tarotoo's MIT-licensed tarot dataset](https://github.com/Tarotoo-com/tarotoo-tarot-dataset) as a semantic reference, not copied from the likely-transcribed third-party list/images. Retain `docs/third-party/TAROTOO-LICENSE.txt` and follow `docs/KEYWORD_EDITORIAL_GUIDE.md` and `docs/KEYWORD_W2_PROVENANCE.md` for editorial/source constraints. Third-party infographic rendering/republication remains out of scope and held in #21.
- Keyword rendering is HTML text, not an image; only the card art is rotated when reversed. The current orientation-specific prose emphasis continues to correspond to the actual API-assigned orientation. The keyword grid is not an automated reading, recommendation or prediction.
- Desktop retains the RWS image on the left and five fixed columns on the right. At narrow widths, the **keyword area alone** scrolls horizontally, without shrinking each column to illegibility; the first column is shown when a new card opens. Accessibility includes native dialog closing by Esc/×/backdrop, return of keyboard focus and natural keyboard access to horizontally scrollable text.
- Data is shipped as static same-origin JS modules; no network call to a third-party tarot service, new WASM dependency, change to 80-card API shuffle/session/branch/draw semantics, TSV layout or 56-card ruby generation.
- Required verification: strict 78-ID/5×4 structural tests, local Node and Pages build contract, actual desktop/mobile browser checks, rights/attribution checks, Formal Review, merge-readiness and post-Pages production smoke. #26 received explicit user approval for the ordinary merge/Pages public release **only after** these conditions are satisfied; this does not grant rights to the held original third-party material.

### #28: concise keywords (supersedes the #26 label-length policy)

- All 390 headings and 1,560 terms use Japanese nouns or compounds: normally 2–3 characters, hard maximum 6 characters. No sentence-like clauses.
- Automated tests require all 1,950 labels to have 2–6 characters, and 95% or more to use 2–3 characters.
- Minimum five-column grid is reduced from 674px to 424px (five 80px columns, four 6px gaps), with reduced padding and row heights.
- RWS artwork, upright/reversed paragraphs and highlights, 80-card API, copy and special-card exclusion remain unchanged. #21 copyrighted images remain held.
- #28 release permissions and CI/review rights gates are assessed separately from the already completed #26.

### #30: portrait detail dialog, keyword rows and source disclosure

- This user-requested **presentation amendment supersedes only the old #26/#28 five-horizontal-columns and scrollable-keyword CSS**, not the accepted 78 card mappings, five headings/four terms shape, licensing, or other historical facts.
- Standard-card details show five **vertically stacked heading rows**, with each row's four existing terms distributed in a four-column, minimum-zero-width list. Labels retain their #28 short-noun policy; **the keyword section has no horizontal scrolling** on desktop, 390px/320px mobile and browser zoom. On narrow screens the enlarged RWS image moves above the five keyword rows. Natural vertical scrolling of the *dialog* remains available for long meanings and zoom; do not crop long prose to forbid all scroll.
- Dialog height grows from up to 86vh/760px to approximately 94dvh/960px on desktop, nearly the full safe viewport on mobile; the close control remains sticky/available. The existing detail artwork grows from 150×257px to 190×326px desktop, and from 90×154px to 146×250px mobile. Reversed **artwork** rotates, never the keyword words.
- A permanently visible small note states the five keyword groups are an overview of the **card as a whole, including meanings/cautions from both upright and reversed orientations**. The existing upright/reversed paragraphs below remain separately highlighted for the actually drawn orientation.
- Default full-width attribution paragraph is removed. An accessible native HTML `details` disclosure controlled by a visible ⓘ summary reveals the original Tarotoo dataset/MIT source attribution and link on demand. It closes on Escape (without closing the card detail), outside click or opening another card; special Title/GUARANTEE details have no keyword grid or source disclosure. Attribution remains reachable by keyboard.
- The unchanged `essence` text is rendered at approximately .98rem instead of .86rem for the `upright` and `reversed` descriptions. All three meanings, card IDs, art license, 80-card draw/session/probability, TSV/copy, Ruby and modal backdrop/×/Escape/focus return stay unchanged.
- Required acceptance: source/rights review, 78×5×4 structural checks, no horizontal keyword overflow or clipping at 320/390px desktop/mobile and 200% zoom, ⓘ keyboard/click/escape/automatic reset and actual Chrome API-draw modal tests, green CI/formal Review and normal authorized merge/Pages/production smoke. Held #21 third-party concept image usage is prohibited.
