# #26 W1 five-card semantic review (editorial draft; 2026-10-08)

## Status and provenance

This document records the **independent Japanese editorial decisions** for the five prototype cards. It is **not** acceptance of the original uploaded reference list, **not** a final validated Japanese translation, and **not** approval to publish. Use only with [#26](https://github.com/kinoko34077/tarot-draw/issues/26) and [Draft PR #27](https://github.com/kinoko34077/tarot-draw/pull/27).

Source consulted: [Tarotoo, MIT, 2026](https://github.com/Tarotoo-com/tarotoo-tarot-dataset), `data/cards.json` (78 cards). License notice: [TAROTOO-LICENSE.txt](third-party/TAROTOO-LICENSE.txt). Fields inspected: `keywords_upright`, `keywords_reversed`, `meaning_upright`, `meaning_reversed`, `love`, `love_reversed`, `career`, `career_reversed`, `mood`, `mood_reversed`, `spiritual`, `spiritual_reversed`. Japanese headings/terms were composed for this interface. No third-party diagrams or attachment-derived heading–term arrangements were brought into this public tree.

**Editorial principle:** five groups are independent conceptual lenses, not a 1:1 split of the English fields, and not fixed categories for upright/reversed. A group may describe a possible reversed interpretation while the existing upright/reversed reference paragraphs remain separate. Do not replace traditional major meanings with only love/career readings.

## Five-card decisions

| Card | Open-data evidence (fields/concepts; not literal reproduction) | Five chosen lenses | Distinctive QA risk and revision |
| --- | --- | --- | --- |
| `major.fool` | upright: beginnings/innocence/spontaneity; love: openness; career: taking risk/learning; reversed: recklessness, hesitation, fear | beginning / agency / learning / openness / caution | Earlier drafts duplicated freedom/creativity in two columns and omitted an explicit caution lens. The fifth now covers the reverse-side cost of unplanned starts. |
| `major.death` | upright: endings, transformation, transition, release, renewal; career: ending outdated role; reversed: resisting change, incomplete closure | ending / transformation / release / renewal / resistance | Prior last group rephrased the first; revise to distinguish delayed closure from an accepted ending. The card is **not** a literal prediction of physical death. |
| `major.devil` | upright: attachments, temptation, materialism, unhealthy patterns, trapped conditions; career: workplace power; reversed: awareness, release, recovery | attachment / temptation / cycle / restriction / recovery | Prior first/fifth columns overlapped desire and self-loss. Replaced fifth with the reversed potential to recognize and break limiting patterns. |
| `minor.swords.3` | upright: heartbreak, painful truth, separation; career: professional disappointment/conflict; reversed: forgiveness/healing/old wounds | grief / hard truth / relational fracture / workplace setback / healing | Previous emotional agitation/mutual friction repeated grief/rupture; revised to include work and recovery meanings with clearer distinctions. |
| `minor.cups.ace` | upright: fresh emotions, affection, compassion, inner opening; career: inspiring/fulfilling opportunity; reversed: blocked feelings, emptiness/self-care | affection / shared emotions / connection / creativity and inner life / emotional blockage | Earlier three columns repeated emotional overflow; distinguished relation, feeling, connection and creative/work/spiritual contexts. Last group reflects reversed meanings without labeling reversal as inherently evil. |

## Review protocol and release gate

- Structural automation checks the **five** existing drafts only: known IDs, exactly five distinct headings, four terms per heading, twenty unique terms per card, nonempty trimmed Japanese labels, short display lengths, and no prototype for either special card.
- Conceptual review checks Tarotoo field support, incorrect inversions, overly narrow relationship interpretations, and whether theme groups repeat ideas despite differing words. Structural tests cannot prove semantic quality, copyright clearance of every possible source ingredient, or good mobile reading behavior.
- UI review must observe **real Chromium** at desktop and mobile viewport sizes, keyboard focus, Esc/×/backdrop close, focus restoration, 5-column horizontal overflow and the fact that only card artwork rotates. Static CSS/test string checks do not establish visual acceptance.
- **Rights gate:** the user's probably-transcribed third-party original is a private coverage comparator; its expression, selection/grouping, images and compilation remain excluded from public data. Issue #21 remains on HOLD.
- **Frontier:** W1-REVIEW, with an explicit editorial/visual acceptance gate before W2. This review note documents changes and unresolved checks; it does not satisfy that gate on its own.
