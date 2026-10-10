> **Superseded by Issue #83 (current target).** This document is retained as provenance of the original user-supplied scans and earlier image-transfer blocker, **not** as an instruction to commit or publish the potentially copyrighted modern print. Current implementation independently recreates the two cards via scripts/generate-deck-a-reconstruction.mjs and checks self-hosted SVGs, not the four historic-scan WebPs. See docs/DECK_A_RECONSTRUCTION.md. The old checksum manifest remains archival only.

# Deck A artwork — received assets and release gate (#81)

Two **user-provided** 1024×1536 JPEG card scans were supplied in the ChatGPT conversation on 2026-10-10. They have already been visually normalized in the conversation runtime (no image generation). **These four WebP files have not been committed to GitHub; this document is not evidence that they exist.**

Install, once public redistribution of the physical-card source is permitted, under exactly these repository-relative paths:

| Relative path under `web/assets/cards/` | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `grid/deck-a-title.webp` | 128×220 | 5,032 | `dcb7689a81b46efe7106d721481665f357b87c7c13b14554a6817c921fabbbf9` |
| `grid/deck-a-introduction.webp` | 128×220 | 10,370 | `86edc179ca7b694413fac49add8d82c41cce5f71cafdaf12f7b36d4030c32457` |
| `detail/deck-a-title.webp` | 256×439 | 12,842 | `e269dcf45b51816415b8c114f8231b8a5070a63be49746e3017e345703047919` |
| `detail/deck-a-introduction.webp` | 256×439 | 34,598 | `de48d01f6bde1d1c94583a864b8a647b1995bd16d9274130df6d756d9e90ca77` |

Archive local to the supplying conversation: `deck_a_tarot_normalized_webp.zip`, containing `tarot_deck_a_art/{grid,detail}/...`. ZIP is downloadable from that chat only, **not** a repository URL. Processing: crop scanner margin without cropping card printing, scale grid to 128×220 and detail to **the existing 78-card 256px image width**, preserving the card visual aspect ratio (256×439), apply rounded alpha mask to outer corners, preserve printed content. Source print and copied English text remain intact; this is not a transcription or licensing determination.

**Non-optional release safeguards:**

1. After the files are supplied to the repository, compare SHA-256 against the manifest; verify actual card visuals and detailed text at browser widths 1440/390/320.
2. `node scripts/check-deck-a-assets.mjs` checks four actual on-disk files for RIFF/VP8X WebP signature, expected dimensions, transparency and budgets. Pages workflow runs it before any upload/deploy; missing/corrupt files fail the release build. This is not a copyright authorization check.
3. The Pamela Colman Smith introduction **physically states** `Reprinted from The Encyclopedia of Tarot, Volume III, by Stuart R. Kaplan`. Because this is a later authored biography and photo, original public-domain 1909 tarot artwork does not establish its public reuse rights. Confirm permission from rights holder or use an explicitly user-approved lawful substitute before committing these binary scans into this public repository or deploying them.
4. Deck B user art is still pending and uses honest placeholders; default B stock 78 images are unchanged.
5. Separate D-3 human gate: the related Worker/API change and coordinated Pages production deployment cannot occur without explicit authorization under #78. No approval inferred from receipt of artwork or this document.

The operational owner is [Issue #81](https://github.com/kinoko34077/tarot-draw/issues/81), staged [Draft PR #82](https://github.com/kinoko34077/tarot-draw/pull/82), parent [Draft PR #80](https://github.com/kinoko34077/tarot-draw/pull/80).
