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

- Tarot card meaning/interpretation database.
- Automated reading text.
- Special draw probability for Title or GUARANTEE.
- Fixed named spreads as API concepts.
