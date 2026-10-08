# #26 — All 78 Japanese keyword grids: provenance and editorial QA

**Status:** Independent-source public-data candidate. Verify exact branch CI, Formal Review, Pages and rights gate before treating this as a released artifact.

## Source selection / intellectual property boundary

- **Included source for concepts:** [Tarotoo Tarot Card Meanings Dataset](https://github.com/Tarotoo-com/tarotoo-tarot-dataset), `data/cards.json`, 78 cards, 22 fields, English original; checked at commit `83202267973950eb5bf034f144b9405db9cb1e7e`; [MIT License ©2026 Tarotoo](third-party/TAROTOO-LICENSE.txt). The upstream README acknowledges initial AI generation, a subsequent editorial pass by Tarotoo and reliance on historical RWS / Golden Dawn attribution. The independently written Japanese short phrases here are not copied English data, and the license notice is preserved.
- **Semantic fields examined:** `keywords_upright`, `keywords_reversed`, `meaning_upright`, `meaning_reversed`, `love`, `love_reversed`, `career`, `career_reversed`, `mood`, `mood_reversed`, `spiritual`, `spiritual_reversed`.
- **Not used:** the user's likely-transcribed third-party original Markdown as text/arrangement for publication, old Issue #21 reference diagrams, Labyrinthos/Tarot Palette text/figures, Oraclume and Love Oracle translations. No unsupported sublicence assumption for the original compilation is made.
- **RWS artwork** continues from pre-existing public-domain Wikimedia-derived, locally served WebP. This feature introduces **zero** new third-party card/brain-map images.
- An interpretive keyword grid is a human-readable reference, **not a factual future prediction, automated tarot reading, or financial/medical advice**.

## Exact card coverage and identity mapping

`src/cards.js` is the card identity authority. Rendered card-specific keywords are in:

- `web/card-keyword-grid.js` — five original-source-first prototypes: `major.fool`, `major.death`, `major.devil`, `minor.swords.3`, `minor.cups.ace`.
- `web/card-keyword-corpus.js` — **73 additional newly authored records**: 19 Major Arcana, 14 Wands, 13 Cups, 13 Swords and 14 Pentacles.
- `web/card-keyword-grid.js` assembles them into **78 unique `card_id` keys**, each with precisely five headings and four terms per heading: **390 independent thematic headings / 1,560 displayed Japanese term instances**. Neither `meta.title` nor `meta.guarantee` is mapped.
- Tarotoo numeric source IDs are **0–21 Major**, **22–35 Wands**, **36–49 Cups**, **50–63 Swords**, and **64–77 Pentacles**, with Ace, 2–10, Page, Knight, Queen, King ascending within each Minor suit. Our `card_id` keys map by card identity and rank, **not** by the user's source numbering/heading sequence.

## Editorial rules applied to all 78

1. The five headings represent distinct aspects of a card's meaning: core motif, effects/actions, relationships or worldly situations, inner/longer-term implications, and caution/recovery where supported. Their semantic **contents vary by card** and do not mechanically mirror an original five-heading graphic.
2. Terms are newly composed Japanese fragments conveying the source's symbolic idea, not a one-to-one translation of four or five English keywords. Natural short language and diverse contexts have priority over filling columns with synonyms.
3. Both upright and reversed source meanings were read; possible limitations or release from limitations can appear alongside promising interpretations. The columns are **not orientation-specific verdicts**; pre-existing upright/reversed prose below the grid continues to carry orientation-specific emphasis.
4. Wands emphasize action/initiative, Cups relationships and emotional context, Swords thought/conflict/truth and possible healing, Pentacles practical work/security/physical resources. These suit emphases are **conventional organising guidance**, not an exclusive or determinist reading of any individual card.
5. Relationship/career/spiritual cues are integrated **selectively** when relevant. Avoid asserting that every card predicts specific relationships, careers, money outcomes, or physical death. For example `major.death` is framed as transition/endings rather than literal mortality, and `minor.swords.9` is worry/fear rather than a medical diagnosis.
6. Source text is not fetched or translated at runtime; the generated HTML labels are static DOM text with `textContent`, and the RWS artwork remains separately rendered. This keeps injection/supply-chain/runtime constraints unchanged.

## Inspectable QA and release conditions

- Machine-verifiable: compare the merged map with `CARD_CATALOG`; exactly 22 Major + 56 Minor, 5 distinct headings/card, 4 nonempty terms/group, 20 **distinct text strings per card**, trim/control-whitespace and display length limits; no special-card data, no prototype-only fallback for standard cards, original description/reversed meaning still present, stable copies from lookup.
- Browser-verifiable: real API-driven Chrome at desktop/mobile; full 78-record loading, interactive card details, horizontal overflow, image/orientation, closing/focus, image URLs and absence of RWS image size regression. Native production URL smoke **after** an authorized Pages deployment, not before.
- Editorial judgment: manual review of each card against its Tarotoo upright/reversed meanings; look for factual/semantic contradictions, near-duplicate *ideas* even when strings differ, and culturally unnatural phrasing. Automated structural QA is **not** proof of meaning or provenance on its own.
- Rights verification: explicitly confirm the public diff contains no original attachment/diagrams or copyrighted source-list structure. Retain MIT notice; keep #21's prohibited image-redistribution workflow held.
- Release permission: user authorized this #26 PR merge/Pages publication (Issue [#26 authorization comment](https://github.com/kinoko34077/tarot-draw/issues/26#issuecomment-6052402935)); this authorization does not waive tests, a formal review, IP checks or other safety constraints. See current exact-head Issue/PR/CI for live release state.

## Limitations

Tarotoo's source is a modern editorial interpretation of traditional tarot and is not an exhaustive historic consensus. Specific phrasing may be revised independently under #26 review while preserving the above source/right boundaries. The private third-party-derived original cannot serve as the literal checklist for public heading selection. The built-in lookup deliberately does not fetch a third-party API.
