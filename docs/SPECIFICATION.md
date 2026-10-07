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
