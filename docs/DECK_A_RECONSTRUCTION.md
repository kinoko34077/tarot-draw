# Deck A — original-look print reconstruction (Issue #83)

## Authority and intent
User explicitly requests Deck A two extras resemble supplied vintage paper cards in fonts, alignment, hues, paper and engraved design, without cheap flat restyling. Build independently owned art and fresh prose; do NOT include original modern physical-card scan or Kaplan's biography text. This design source supersedes #81's original-scan binary-asset publication plan, which was copyright-gated.

## Measured look, coordinate system
- Canvas SVG viewBox: (0,0,1024,1755), matching existing 78-card portrait ratio ~150:257. Ivory card frame x58–966, round corner radius 55. Outside frame transparent. Do not stretch original 1024x1536 scans to fit.
- Title: muted indigo violet printed region x105–920; old-cream lettering #F4E6B5, deep purple #211B5D and subtle irregularities. Central three-line Victorian transitional serif large capitals, tall header y175/330/485, ample central reserved space. Credit blocks at lower y1290/1505.
- Illustration: newly constructed ouroboros etching ~circle centered (512,935), outer radius 205, cream rings, hand-built crosshatching, dots, tapering split tongue, independent outline; do not trace the later edition ring from the modern user scan.
- Intro: neutral paper #F2F0E8 / black ink #141515. Strong uppercase black heading y130 (period sans serif); 28–31px text with justified line proportions. Top paragraphs y215–425, independent historic portrait on left x130..505 y480..1105, right text x548..910. Bottom bio paragraph across full width and restrained original provenance line near y1645.
- Body text stays readable at user-initiated detail size; archive photo intentionally aged (monochrome already), paper grain restrained, no modern shadow/gloss.
- Source remains editable text SVG generator; self-contained static SVG outputs with any portrait bitmap embedded during BUILD, not runtime hotlink. Grid/detail may reuse SVG and browser renders crisply, with fallback and accessibility label. Keep all standard 78 WebP unchanged.

## Historical sources and new authorship
- Archival portrait originally published in US magazine The Craftsman October 1912, photographer unknown. Public-domain-in-US designation at https://commons.wikimedia.org/wiki/File:Pamela_Colman_Smith_The_Craftsman_cropped.jpg . Explicit source in repo; outside-US status requires case-by-case analysis.
- New English prose based on Whitney Museum https://whitney.org/exhibitions/dawn-of-a-new-age/art?section=21&subsection=2 , Morgan Library https://www.themorgan.org/exhibitions/online/tarot/13 , and British Museum https://www.britishmuseum.org/collection/term/BIOG198979 . No copied Kaplan sentences or distinctive structure. No fake manufacture line or reference to the copyrighted later booklet.
- Title text depicts work title, A.E. Waite and Pamela Colman Smith historical attribution; original independent print ornament/design.
- Credit/publication rights and source links included in docs and accessible card information.

## Validation/release
- Both outputs must include nonzero image, round alpha outside, viewBox, intrinsic portrait aspect, no runtime remote image href; reproduce against reference at 128px grid, 256px detail, 390px mobile.
- Existing title+secondary checkboxes, 78/79/80, 30+ primary/parallel, ○/× mask/copy, P1 no-repeat stay unchanged. Test cards A previews/results/details and B placeholder.
- Dedicated Issue #83; staged Draft PR stacked on Draft #82; NO production Worker update/Pages publication without separate explicit #78 D-3 approval.
