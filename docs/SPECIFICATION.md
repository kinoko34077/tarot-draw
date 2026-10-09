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

### #32: corrected adjacent vertical-writing keyword table (supersedes #30 layout)

- The user's corrected acceptance supersedes **only** #30's **mobile stacked image**, horizontally written table terms, always-visible upright/reversed note and forced-height blank area. All existing 78-card words and card descriptions remain unchanged.
- **At every viewport including desktop, 390px and 320px**, the enlarged RWS card must remain at **upper left** and the keyword matrix **immediately right**, never below it. The table and image align at their top edges and jointly occupy the vertical space before **本質**, with no large dead zone beneath the card. The modal's height is **content-driven**, limited by the viewport, rather than fixed to a large height with padding.
- The keyword display uses a **real semantic HTML table** with 5 rows, each containing a row header (one of the same five headings) and four `td` keywords. All 25 heading/term cells use vertical Japanese writing (`writing-mode: vertical-rl`, `text-orientation: upright`), remain legible at small widths, and have **zero keyword horizontal scrolling/clipping** at desktop, 390px, 320px and 200% zoom. Browser tests explicitly assert image/table bounding rectangles, vertical writing, 5×5 cells and absence of wasted space, not merely data shape.
- The prior always-visible “正位置・逆位置の両面...” explanation is **removed**. The `ⓘ` action resides in the dialog header next to Close and alone reveals a brief scope clarification (“正・逆位置の両面を含む、カード全体の関連語です。”), MIT provenance and the Tarotoo dataset link. The source does not visually repeat beside every table. Keyboard Enter/Escape, click outside, state reset, and two special-card exclusions are preserved.
- Existing larger Essence typography relative to upright/reversed descriptions, public-domain RWS image/orientation rotation, user-entered spread/TSV, 80-card authoritative API/session and original prose remain unchanged; no redistribution of held #21 third-party concept images. At small screens, a naturally necessary **vertical modal scroll** remains available to read all content.
- Release acceptance: unchanged 78×(5 heading+20 short terms) card data; exact-head CI, real Chrome desktop/390/320/zoom geometry, modal/ⓘ regression and published Pages smoke; scoped standing same-feature approval and formal review apply before any reversible merge/publication.

### #34: visible keyword heading and adjacent contextual info (supersedes only the #32 help location)

- As required by the user and `kinoko34077/.ai-guidelines#21` (UX-01/04/06/07/12/15), display the **one-line visible heading `キーワード` immediately above the right-hand 5×5 vertical-writing table**. The table and its containing region use `aria-labelledby` pointing to that visible heading, so screen-reader references and visible hierarchy share the same name.
- The existing keyboard-focusable ⓘ **sits beside that heading, not in the global card-dialog header**. The default view retains only the title and the table; short upright/reversed whole-card scope clarification and Tarotoo MIT source/link remain inside ⓘ on demand. Do not add redundant permanent description paragraphs. The ⓘ icon has an accessible descriptive name and adequate discoverable touch bounds, fits narrow screen and leaves the original reading context unchanged when dismissed.
- Preserve the upper-left enlarged RWS artwork beside the right-side 5×5 semantic table at desktop/390/320 phone and 200% zoom; headings and keywords remain upright vertical Japanese, with no horizontal panning, clipped terms or large blank gap before `本質`. Tall text may use normal dialog vertical scrolling. Special Title/GUARANTEE cards have no keyword heading/table/source control.
- Acceptance follows the **user's task**, not component existence: first-time identification of table and ⓘ referent, repeated detail open/close and focus return, keyboard/tab/enter/escape/click/touch, accessible table naming, viewport-safe popup and real browser geometry. Record UX-15 separate PASS/FAIL/UNVERIFIED/N/A judgements, especially physical Japanese assistive technology and perceived click affordance which are not inferable from CI. Avoid unapproved unrelated product expansions.


### #59: unified ruled keyword table + side-by-side descriptions (supersedes presentation-only #34)

- The latest explicit user correction supersedes #34's separate keyword heading bar: standard-card detail contains **one semantic `table`**, with a **single `thead > tr > th colspan="5"`** that includes the visible `キーワード` heading and its adjacent keyboard-accessible `ⓘ` source disclosure. The table and region retain `aria-labelledby` referring to that same visible heading. No duplicated heading outside the table.
- The `tbody` remains exactly **five theme rows**, each with its original `th scope="row"` and four `td` term cells (25 body cells per card). All body headings and terms retain their upright vertical Japanese writing and original static mapping; the four term columns have **no invented per-column semantic roles**. Render **one continuous table**, with all column separators and all row separators (`border-collapse:collapse`, zero cell spacing/radii), with distinct theme-column shading. **Latest #62 corrective acceptance**: the *horizontal* rules must visibly group the five thematic rows; *vertical* dividers are substantially paler, just enough to follow columns; heading-column divider may be intermediary but must remain lighter than horizontal. Avoid equal-strength cell borders and a thick outer box, which recreates 25 boxed cards without rounded corners. This replaces #59's ambiguous equally strong ruling and holds at 320/390/desktop without changing text/data.
- Preserve the large RWS art at the upper left, the adjacent vertically written keyword table to the right **at desktop, 390px and 320px** and 200% zoom, no horizontal keyword scrolling/clipping, top/bottom visual alignment, vertical dialog scrolling for long descriptions and dialog native close/keyboard/focus handling. The source popover remains available, viewport-safe and dismissible on Esc/outside click; Tarotoo MIT origin and source link must remain.
- Show card name and the drawn upright/reversed orientation **horizontally together** in the dialog header. Below `本質`, place the existing `正位置` and `逆位置` descriptions **side by side** in a two-column comparison even at small widths, highlight and accessibly name the actually drawn side. Neither explanation is deleted.
- **No changes to source meaning data** in this structural amendment: all 78 existing `essence/upright/reversed/source_url` fields and 78×(5 heading +20 terms) keyword data remain untouched, including their editorial provenance. Any prose-style normalization is a separate source-faithful editorial review; no invented meanings for Title/GUARANTEE.
- Preserve the source image licensing exclusion #21, the authoritative 80-card API and fixed orientation/draw, pile snapshot 27/27/26, optional Parallel, TSV and ruby. Verify real Chrome rendering, keyboard/native details, 1440/390/320 and zoom, data/rights and current-head CI before reviewed reversible Pages publication; machine proxies are not human-participant comprehension evidence.


### #64: foreground thematic rules and readable result export (supersedes the default-TSV UI copy policy)

- User correction: vertical keyword-table lines remain **faint column guides**, but **horizontal thematic row separators paint in the foreground at every intersection**. Maintain one native 5×5 semantic table, 78 standard cards, preserved text/width and 320/390/desktop layouts. Horizontal overlay is visual only (`::after`, `pointer-events:none`), with existing table borders as fallback.
- For a completed reading, **「結果をコピー（Markdown）」 is the default copy action**: Markdown heading, question, separate labelled Primary and optional Parallel n×m tables, column/row labels, drawn card names with orientations, canonical copied Japanese ruby text. Escape user-entered Markdown and pipe/newline controls so labels cannot change table column counts. Do **not** generate an interpretation.
- Preserve previous tab-delimited TSV output as an **explicit secondary 「TSV」 copy action** for spreadsheet use; don't silently delete that workflow. Both use the same committed server results and post-draw edited labels; one shared accessible local feedback. Copy never initiates a draw.
- **Only when Parallel is drawn**: add a titled explanation to both Markdown and TSV: users' hesitation between alternate piles is itself regarded as meaningful; read the hypothetical "if I had chosen the other pile" result *alongside the actual main result*. Both originate at the same shuffled split snapshot but are independently drawn from different piles. Do not claim the alternate occurred, predict outcomes or reinterpret cards; no Parallel note on single-pile copies.
- Append existing Title/GUARANTEE structural notes conditionally in both formats and only when such cards are actually included; don't invent their esoteric meanings. The server/API, shuffled 80-card 27/27/26 distribution, images and third-party licensing #21 remain unchanged.


### #66: 80-card multi-pile UI and compact copied names

- User's correction supersedes the old 27-card **UI layout** limit: row/column add controls may expand any rectangular arrangement up to **80 positions**, not 81. Server-authoritative 80-card shuffle/orientation and physical 27/27/26 piles remain unchanged.
- Original first-pile selection flow remains: choose a main pile; **only if that pile cannot cover the requested position count** (e.g. 27+ in a 26-card C pile; 28+ for A/B), show actionable text **「枚数確保の為次の山を選択」** and require an explicit second/third pile. Fill positions in row-major order, exhausting each chosen pile in user-selected order without duplicated cards in a single Primary reading. **Do not automatically transfer or draw from another pile.**
- Only **after Primary has enough cards** can the next pile click choose an optional Parallel starting from another first pile, as before. If its chosen pile lacks capacity, require another explicit pile selection. When all three main piles are needed (55+ and some 54-or-less choices), no alternative first pile exists, hence Parallel cannot be selected. An optional Parallel follows the same frozen shuffle snapshot on independently created server branches, and may share source pile references across hypothetical alternative outcomes but never repeat a pile *within* one branch sequence.
- Multi-pile drawing uses existing `POST /sessions/.../branches` and `POST /branches/.../draw` per selected pile, disjoint position sets, and only shows a completed merged result once **all** server replies are verified. Unknown/partial commits never auto-retry or silently claim an outcome. No change/deploy to Worker/Node API, 80-card deck, pile sizes or persistence.
- Row headers have **fixed narrow width and vertical writing**; column headers have **fixed width**. If visible names are too long, shrink their rendered font rather than changing widths. Full original labels remain editable, available accessibly and preserved in both Markdown and TSV copies. Do not change semantic placement with names.
- Markdown/TSV clipboard card names omit parenthetical phonetic ruby (e.g. **杖の騎士 逆位置**); on-screen compact ruby stays unchanged. The copy's question, grid labels, orientation, conditional Parallel-method explanation and special-card footnotes remain.
