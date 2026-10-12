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


### #78: selectable decks and original-card inclusion (2026-10-10 explicit correction)
- Two user-selectable presentation variants, set from a visible top-right ⚙ settings dialog: **Deck A** = standard 78 + Title + Pamela Colman Smith biography/introduction card; **Deck B** = standard 78 + Title + GUARANTEE, preserving the current default and older readings.
- Artwork for both full decks, including the separate Title and second-card faces, will be provided later. Until supplied, all four custom art preview slots must explicitly say **画像準備中**. Do not synthesize biographical copy or present invented art as final. Current public-domain RWS 78 assets remain provisional standard-card imagery pending user-supplied assets and rights review.
- The actual **Deck A introduction** receives immutable server card ID `meta.introduction`, whereas Deck B retains `meta.guarantee` (do not alias one as the other). Each 80-card shuffle has precisely one deck-specific second special and a `meta.title`; the standard 78 retain their IDs. Card title, detail view, copied Markdown/TSV notes and preview use the reading's selected deck; no invented meaning or retrospective rewrite.
- Checkbox **オリジナルカードを使用** is checked by default and controls deck **composition**, not just rendering. Checked = 80 cards, 27/27/26 piles; unchecked = the same 78 standard cards, 26/26/26 piles with **no** meta cards. Shuffle uses the server-authoritative POST /api/sessions/:id/shuffle body `{ "deck_id": "A"|"B", "include_custom": boolean }`. Older callers omitting both flags retain default B/80. Reject malformed deck ID/checkbox fields with INVALID_DECK_OPTIONS (400) before mutating session state. Record returned `deck_id`, `include_custom`, `total_cards` and pile counts; do not silently fall back to a backend that ignores the A or 78-card option.
- Changing settings applies to the latest **editing** workspace where its card count is legal. An already shuffled, drawing, or completed session holds its original settings; changes are for the next new reading and are explicitly indicated. No browser-local persistence, new questions storage, API re-draw or unauthorized background requests are introduced.
- The 80-position maximum in older sections applies only when originals are included. With originals off the UI max is 78 positions; fill piles only by explicit user choice and keep the P1 unknown-result/no-repeat contract. Parallel remains an independent branch from the same immutable split, without duplicating card IDs within one branch.
- The column **operation strip** remains 32px wide as in #75, but the vertically stacked +/- buttons revert to **27px square buttons**; the second square occupies only the empty column-actions tail space below the compact 36px header, not a data cell. Row controls unchanged.
- **Release gate:** The Worker/API semantics change is deliberately staged; no production Worker deploy or incompatible Pages publication until explicit human authorization for the backend. Exact-head tests must verify Node/Worker invalid options and 78/80 drawing, browser accessible modal/previews/390px mobile and 80-mode regression, then published Pages+API coordinated acceptance after approval.


### #81: independent Parallel piles, per-original deck flags, excluded cells, and supplied A art

- **Main/Primary and Parallel each have their own visible A/B/C selectors.** Both select ordered pile IDs from the **same authoritative shuffle** but use separately created independent branches. A pile selected on Primary must not disable or clear that pile on Parallel. The same underlying card can appear independently on both hypothetical branches when intentionally using the same pile; never duplicate a pile within one branch sequence. A branch consumes its explicitly selected piles in order, exhausted first to last, and assigns cards to **active row-major** position IDs. No automatic pile crossover or additional reshuffle.
- **Two separate checkboxes**, Title and the deck-specific second special (A: `meta.introduction`; B: `meta.guarantee`). Either independently on/off. Exactly 0, 1 or 2 extras yields **78 (26/26/26), 79 (27/26/26) or 80 (27/27/26)** server-owned split counts. POST `/api/sessions/:id/shuffle` accepts strict boolean `include_title` and `include_secondary` plus `deck_id`; legacy `include_custom` defaults both flags when individual values not supplied. The live UI checks returned individual flags; no silent fallback from a backend unable to honor this contract.
- **Each cell initially ○ and can become × before draw.** The × position is excluded from server draw positions while preserving the table's row/column coordinates; results retain a visible ×, and copies render a literal `-` in that cell. Active count (not matrix area) determines required pile capacity. All-× is not drawable, and shuffle is disabled until at least one ○. Row/column move/delete remaps excluded positions, and structural Undo/Redo captures exclusion state. Between shuffle and draw users can still toggle the selection; after result commitment no changes to skipped cells.
- **User-supplied images** for Deck A Title and Pamela Colman Smith introduction received 2026-10-10 as conversation attachments; no image generation. To match existing grid/detail card slots, the two images were cropped **only in outer blank scanner margins** preserving content, resized to **128×220 grid and 256×439 detail WebP**, and rounded outer corners alpha-masked. The four normalized derivatives are in the current conversation archive; **GitHub binary insertion still required** at `web/assets/cards/{grid,detail}/deck-a-{title,introduction}.webp`, currently absent on PR #82. The application maps these exact names and settings previews have explicit unavailable-art fallback.
- **Copyright release condition:** the supplied Pamela introduction image includes a reprint credit to *The Encyclopedia of Tarot, Volume III*, Stuart R. Kaplan; public redistribution rights for this text/image are **not verified** by user upload alone. Obtain authorization or approved substitute before publishing it publicly. Deck B new image assets remain future inputs. The existing D-3 human Worker/API release gate under #78 remains mandatory, regardless of code-only validation.
- Acceptance scenarios: a 30-card layout Primary A→B consumes 27+3, Parallel C→A consumes 26+4 independently; cross-shaped 3×5 layout with 8 × cells draws exactly 7 positions with `-` in copies; 78/79/80 legacy and new contract tested; P1 unknown commits never silently repeat.


### #83 replacement artwork (supersedes #81 modern-scan publication plan)

Deck A title and introduction must be *independently authored* high-fidelity vintage-print reconstructions (new typography, new ouroboros, fresh biography prose, embedded public-domain 1912 archive portrait). Do not commit or distribute the user's modern 1993 reprint scans and later Kaplan text. Current assets are generated, self-contained SVG card faces with 1024×1755 master aspect, used by both 128px grid and 256px detail slots. The generator performs build-time Commons fetch pinned by SHA-256; no runtime hotlink. The preceding #81 WebP requirement/manifest is historical, superseded for Deck A by #83. Existing Worker D-3 publication gate remains.


## Superseding settings artwork and controls (#86/#87, published via PR #88)
This section supersedes only the older #78 external checkbox UI and earlier #83 print-art sizing/spacing details; historical initial specifications above are retained as provenance. Each Deck A/B radio selection contains **two large preview-card checkbox tiles**. The checkbox is placed *on* the title or secondary card image itself; no external one-size-fits-all special-card toggle. Only the selected deck's two checkboxes are enabled; inactive deck previews remain visible but their controls are disabled. Each deck remembers its own two choices across switches, and next shuffle uses only the selected deck's two flags. A rejected setting (e.g. 80-cell layout requesting 79 cards) restores radio/checkbox UI to the current committed state. Existing readings remain immutable once shuffled.

The card previews scale to available dialog width instead of 33–40px thumbnails; display two cards side by side on desktop, stack into near-detail-size 244px portrait cards on narrow mobile; dialog scrolls vertically, not horizontally, even on 320px displays. Deck B retains explicit empty-image placeholders until lawful user art arrives. #83 revised title/paper and independently written 313-word Pamela biography use editable self-hosted SVG built from pinned 1912 archival photo, no modern copyrighted physical card scan or Kaplan passage. Server `deck_id`, `include_title`, `include_secondary`, 78/79/80 counts and the P1 branch safety contract do not change. No Worker redeploy required. This change was authorized and published from PR #88 at `a09f3ef1d748b29648170cfca683c035191fba1a`; main CI #38152747092, Pages #38152747100 and Production UI Smoke #38152793497 succeeded. Future releases continue to require their own applicable authorization.


## UX corrections #90 (staged, not published)
- ○ / × toggles are frameless characters within the existing 28×28 clickable, keyboard-focusable button; no circular border or circular pressed-state fill. Excluded-cell copy remains `-`.
- Conditional pile choice is based on the actual number of *active ○ cells*: **1–26**: one compact three-pile control, first choice Primary, optional second distinct choice Parallel; tapping a selected choice deselects it (deselecting Primary also clears its dependent Parallel). No “1番目” for a lone choice. **27+**: separate independent 3-pile controls for Primary and Parallel as in #81, independent multi-pile ordering and same-shuffle hypothetical branch semantics; rank text only when a branch selects multiple piles. When masking crosses 27→26, retain first Primary and first distinct Parallel rather than discarding all choices.
- Reading deck summary appears at the right of the Q/question area, not next to “Reading n”; on narrow screens it occupies a right-aligned second row so the question input keeps its visible width. Row-heading 62px track and Primary/Parallel heading title share the same width; column heading 34px tracks the section title bar height.
- No deck/shuffle/Worker/API contract changes, no automatic artwork replacement. Deck A ouroboros selection stays in #83 pending user choice among verified reusable SVG candidates.
- Publication authority: Tarot Draw's routine reversible releases are under the explicit standing user authorization recorded in persistent Issue #92 (2026-10-12). This supersedes the prior requirement for per-release approval for ordinary changes; security-sensitive, destructive and irreversible actions remain separately gated.

## #90 follow-up after user visual feedback (2026-10-12)
- In the 1–26 active cell mode, show one compact three-pile button row, a single "山" label only, with first selected Primary and optional second selected Parallel. In 27+ mode, show just the labelled Primary/Parallel rows without the redundant standalone "山" heading. Preserve all current backend pile ordering and mask boundary logic.
- Row label **horizontal thickness (36px)** equals the perpendicular column header band **height (36px)**. The row grip remains above the vertical label. Column data cells retain independent flexible 96px minimum widths; the first row track no longer consumes 62px.
- Deck status for the most recent Reading is displayed in the global app header, right aligned immediately before the settings button. Do not repeat the deck text in every Reading row; changes to next-reading settings must not mislabel a previously frozen reading.
- Deck A title image now uses the user's chosen **public-domain AnonMoos `Ouroboros-simple.svg`** vector outlines, rather than the previously home-drawn ellipse/head. PD original, locally embedded; documented in `docs/DECK_A_RECONSTRUCTION.md`.
- Ordinary Pages publication authorization is standing for this repo: see persistent `tarot-draw#92`. Tested, reversible releases may proceed without per-release approval. Destructive/security-sensitive/irreversible actions still require separate human authorization.

## UX93 corrections (2026-10-12)
- Place the six-dot row reorder control below the row name, reserving the bottom part of the 36px-wide row label, without overlapping the vertical glyphs. Keyboard, drag, focus and editing remain available.
- Restore the historical alternate reading hint `迷ったら別の山を選んでifを確認できます。` for both compact and independent optional comparison. The older PR #82 patch had a duplicated `で`, corrected here without changing meaning.
- The three title lines use per-word tall initials and shorter following capitals. The PD ring is rotated 180° relative to the published upside-down version.
- After each explicit column +, automatically scroll the matrix to the newly grown right edge. Other actions keep existing scroll positions.
- Card detail immediately shows the available grid art, then swaps to high-resolution art after decode. Prefetch only likely details on pointerenter/focus/pointerdown with bounded cache of 12; no entire-deck preload. Keep reversals, special Deck A images and fallback behavior.
- No Worker/API changes. Ordinary Pages publication is authorized through #92.

## #97 UI corrections (2026-10-12)
- Deck A title art uses the reference-proportioned chosen Liberation Serif fallback stack, **disjoint independent word-width text boxes**, explicit large per-word initial capitals, and small following capitals; source comparison recorded in `docs/DECK_A_RECONSTRUCTION.md`. The same repaired SVG powers main grid/detail and settings preview without a settings-only offset hack.
- Edit feedback (undo/redo/reorder and errors) appears inline **after the 配置 heading** with `｜` separator; fixed single-line heading height prevents pushing the matrix down as status changes. On narrow widths the message elides without moving controls.
- Completed result masks are centered in both Primary and Parallel. Both branches render from the **same frozen excluded position IDs**; tests independently compare all excluded cells, both visible × glyph positions, and card counts for a 28-active-cell irregular 30-slot draw. Snapshot freeze and same-source matrix are retained, no separate branch-local exclusion switches introduced.
- Card names retain out-of-flow ruby, with 29px title/13px orientation rows inside a 42px label region (vs 33px +14px with 47px region). Font reading overlays must not contribute to line box height. Existing 78/79/80 & Worker draw contracts unchanged.
- Normal release authority #92 covers this reversible scoped Pages publication after exact-head UI/CI checks.


### #99: number-22/23 specials, major-only, title print raster (2026-10-12)
- The 22 standard Major Arcana are numbered **0 through 21**. The selected Title Card is **22**, and the deck-specific second extra (A `meta.introduction` or B `meta.guarantee`) is **23**. The A introduction and B guarantee remain distinct immutable IDs and art. Their copy/export/disclaimer pattern is identical except for the specific name; no unsupported predictive function. This **supersedes** historical statements that Title precedes Fool or GUARANTEE is numbered 22.
- Settings include **大アルカナのみで占う**. Default disabled preserves the 78/79/80 set, checked filters 56 minors **before the shuffle on server**, leaving 22 majors plus zero/one/two user-checked extras = 22/23/24 cards. Server returns `major_only`, exact counts and independently frozen result contents. 3 piles are distributed 22=8/7/7, 23=8/8/7, 24=8/8/8. Both Node and Durable Object + public Worker must honor it and reject nonboolean `major_only`; absence means full deck for older clients. A/B deck and extra-card checkbox selections remain orthogonal.
- The compact shared 3-pile selector remains when one selected pile has enough cards; in major-only mode, when requested active cell count exceeds any pile's capacity the independent ordered Primary/Parallel selectors are used so multi-pile drawing can fill up to 24 slots. Row-major positions, separate branches, immutable shuffle and error safety persist. Current unshuffled layout cannot exceed its mode's authoritative deck size.
- The supplied physical title scan is for **private overlay registration only**, never embedded/uploaded to Pages. The independently authored original SVG is kept as build master. After aligning the user's 1024x1536 scan to the 1024x1755 reference coordinate system, each title line's independent width, baseline translation and Y stretch were calibrated to the printed visible envelopes. The build generates **font-baked WebP raster files** for grid 256×439 and detail 512×878 using pinned sharp; settings uses the same detail raster. Browser no longer lays out reconstructed title SVG glyphs live, avoiding font-specific clipping or position shifts. Independent PD AnonMoos ouroboros and separately authored biography are unchanged.
- CI and Pages first run the rasterizer and validate WebP magic bytes/dimensions, rendered art and Node/Worker/UI tests. Existing WebP artwork of the 78 standard cards stays unchanged. Normal Worker + Pages publication is authorized by local policy #92; high-risk/destructive controls remain gated.

## #103 compact settings & title imprint (2026-10-12)
- Title has a subtle, truthful bottom credit `Recreated by KiNoTch.` instead of the original physical-product manufacturing imprint; do not reintroduce misleading manufacturer text. Existing title, artist credits, and user-confirmed head-down serpent direction must be preserved.
- Settings controls are ordered: small sticky `デッキ設定` header, **大アルカナのみで占う** toggle and dynamic 22–24/78–80 total, then Deck A/B radio/card selection, then next-reading notice and Done. Remove redundant help paragraph, visually redundant legend and unnecessary vertical padding.
- Reduce title, selection and label gaps without hiding cards or disabling touch controls. On 320/390px, each deck's two special-card previews display side-by-side to substantially shorten scroll height; no horizontal overflow. On wider screens, Deck A/B panels can sit in two columns. The introduction preview caption and checkbox accessible label use only **紹介カード** (the underlying historical card title, biography and card ID remain intact).
- Changes are UI/SVG-generation only; no Worker/API, state, selected card membership or numbering changes. Regression Chrome checks control order, 320/390 dimensions and checkboxes. Routine publication remains authorized by #92.

## #107 Deck A-only title/introduction detail references (2026-10-12)
- This amendment supersedes historical statements that all special cards categorically lack interpretive meanings. **Only Deck A** receives user-authored special-card meanings; Deck B remains unchanged, including its own Title and GUARANTEE. This is presentation-only; it does not alter draw/session/Worker, numbering, custom notes, copies or card assets.
- Deck A `meta.title`: independent 「ウロボロス（境界の鏡）」 reading, neutral regarding good/bad fortune. The essence concerns cycles, boundaries, transitions, and reframing the whole story or original assumptions. Upright 「終わりの始まり」 (closing/letting go/preparation); reversed 「始まりの終わり」 (end of preparatory time, decision/action).
- Deck A `meta.introduction`: independent 「創り手（遺されるもの）」 reading. Creative work's value is not identical to its creator's recognition; work may be inherited after its creator. Upright 「創造の継承」 (transmission of creations); reversed 「埋もれた創造」 (unrecognized contribution and rediscovery).
- Both Deck A specials now use the existing five semantic headings × four vertically written keywords beside the card image, the same 本質/正位置/逆位置 meaning sections and draw-orientation emphasis. User-provided special meanings are explicitly marked as independently defined in the ⓘ info; existing Tarotoo MIT attribution is **shown only for standard 78-card keywords**. Nothing comparing these cards to XXI 世界 is added.
- Deck B's `meta.title` / `meta.guarantee` still show the existing custom-card note and no semantic table. The standard 78 `CARD_DETAILS` and `CARD_KEYWORD_GRIDS` data remain exclusively standard-card records. This gating must depend on **both card ID and chosen Deck A**, never card ID alone.
- Tests verify deck isolation, content labels and 5×4 shape, independent provenance, and preservation of the standard/reference paths. No new network resources, external copyrighted source images, Worker changes or deploys.

## #109 Deck A display-only names and row add follow (2026-10-12)
- In Deck A **outside settings**, special Title (`meta.title`) appears as **22 ウロボロス** and Introduction (`meta.introduction`) as **23 創り手**, including result, detail heading, accessible text, copy and notes. Deck B presentation stays unchanged. Settings Deck A checkbox labels/preview captions stay **タイトルカード / 紹介カード**. Card IDs, counts, meanings, images, Worker and selection are unchanged.
- The row add footer's fixed 36px left strip positions the 27px **＋** from the left rather than centering two adjacent 27px controls in 36px; **−** may extend into the otherwise empty footer row on the right, remaining clickable. After successful repeated row additions, adjust the page's vertical scroll only when needed to keep the newly rendered row ＋ visible at the screen bottom, without horizontal pan. Column ＋ continues to auto-follow the right edge; remove/reorder/Undo retain their prior scroll behavior.

## #111 Row divider alignment, durable preferences, and in-matrix card piles (2026-10-12)
- The 36px row-label/fixed footer strip now positions + and − with the **actual 36px row/header border exactly within the gap** separating them (plus left of rule, minus right of rule). Both are fully clickable with no clipped text; row + bottom auto-follow from #109 remains.
- First-ever browser use defaults to **Deck A** (both independently authored Title and Introduction included, normal 78+2 mode). A user's saved choices override the default.
- Browser-only versioned local preferences retain active Deck A/B, major-only setting and each deck's independent title/secondary inclusion toggles across new readings and page reload. Corrupt/unavailable/blocked storage falls back safely to Deck A defaults; updates are applied only to editable current readings or new readings, never retroactively to frozen shuffle/draws. No server persistence and no question, result or branch/session state in localStorage.
- After shuffle, the three actual backend pile choices remain A/B/C, with their authoritative capacities and Primary/Parallel ordering unchanged. Their visual controls now appear as **CSS-drawn vintage card-back stacks over the primary spread/table**, rather than a toolbar above it, with subdued 山A/B/C captions and visible selection roles. The compact shared single-pile/optional parallel and independent multi-pile branches stay functionally distinct. On 320/390/desktop cards fit the table overlay without clipping or adding external images. The table remains the authoritative state; no Worker/API changes.

## #114 Minimal site icon and PWA audit (2026-10-12)
- Original, self-contained vector favicon in `web/favicon.svg`: navy rounded tile, gold tarot-card outline and central star. No uploaded image, third-party artwork, network dependency or copyright gate. The HTML links the browser SVG icon and a 180px Apple touch icon.
- Pages build uses the preexisting pinned sharp dependency to rasterize the authoritative SVG into `apple-touch-icon.png` (180px), `icon-192.png` and `icon-512.png` in the published artifact; these generated binaries are not duplicated in Git. Node development static server serves the SVG favicon.
- PWA **not implemented** at this checkpoint: neither a Web App Manifest nor a Service Worker exists; the presence of a touch icon does not by itself imply installable or offline PWA support. PWA conversion/offline strategies are separate future decisions and must not alter backend-authoritative random draws or store questions/results without explicit scope.

## #116 Row add on Safari; pile-adjacent draw; explicit Deck A original mark (2026-10-12)
- Row footer ＋/− and fixed 36px dividing-line geometry from #111 remain unchanged. After row +, follow the newly rendered + with the **document.scrollingElement** by the necessary positive vertical delta, taking the **visualViewport** usable bottom into account, and recheck at requestAnimationFrame after focus/layout; no nonstandard `window.scrollBy({behavior:'instant'})` and no horizontal matrix pan. This corrects a user-reported lack of following on device (the older Chrome test alone did not establish iOS parity).
- During pile selection, the same guarded `引く` action appears **immediately beneath the card piles** in the overlay as well as in the existing global action area. Disabled until a sufficient valid Primary (and if provided Parallel) selection exists; both disable synchronously during the same pending draw and retain the backend single-draw/no-retry safety invariant. Existing shared and multiple independent pile selection behavior, normal complete/new Reading and pending uncertainty are unchanged.
- Deck A only, `meta.title` (22 ウロボロス) and `meta.introduction` (23 創り手), detail dialog heading shows compact visible `オリジナルカード` caption. Standard 78 and Deck B cards show no caption, Deck A keywords/provenance/reference meanings stay as accepted. No changes to settings captions or source images.

## #118 Help screen and topbar vertical breathing (2026-10-12)
- Increase topbar vertical padding and height on desktop and mobile while keeping the deck summary, Tarot Draw brand and two buttons on one compact 320px-wide row. Place a **?** trigger immediately **left** of the existing settings icon/control.
- A self-contained, native `<dialog>` opens from the ? trigger and uses settings-dialog visual vocabulary: modal backdrop, sticky title/close controls, readable scrollable sections, native Escape/backdrop/×/footer-close and return focus to the ?. The help is read-only and available regardless of reading phase.
- Three Japanese help sections: (1) question, labelled n×m spread and masked cells, shuffle, A/B/C piles (single shared selector or independent ordered Primary/Parallel, sufficient-card guard), two identical Draw controls, card details/copy/new Reading; (2) positions and upright/reversed reference meanings with non-deterministic interpretive framing, optional hypothetical Parallel from one shuffle; (3) Deck A originals 22 ウロボロス (title card) and 23 創り手 (introduction card), Deck B separate original 22 title and 23 GUARANTEE (no guarantee of appearance/outcome), card-specific ON/OFF, major-only, stored preferences and frozen reading invariants.
- Help does **not** claim automatic divination, deterministic predictions, full PWA or new card abilities. No backend, model, card-meaning, source-art or storage change. 320/390/desktop geometry, focus, Escape and overlay state regressions are tested in actual Chromium.
