// Deck A-only interpretive references, authored from the user's 2026-10-12 card definitions.
// Presentation only. Deck B has independent special cards and no meaning data here.
// These are NOT part of the Tarotoo-sourced standard 78-card keyword corpus.
const DECK_A_SPECIAL_INTERPRETATIONS = Object.freeze({
  'meta.title': {
    essence: '【ウロボロス（境界の鏡）】物語や人生の転換点を俯瞰し、終わりと始まりがつながる境界を映す。循環・死と再生、白蛇の知恵と変容、紺色の静寂と内省を象徴する。善悪や吉凶は直接示さず、今ある前提や初心、状況全体の捉え方を見直す。',
    upright: '【終わりの始まり】一つの物語が区切りへ向かい、次の物語が静かに始まる。手放すべきものを整理し、次の段階に備える時期。',
    reversed: '【始まりの終わり】準備や猶予の段階が終わり、現実と向き合う時期。決断して行動に移し、停滞から抜け出す。',
    keywords: [
      ['循環', ['永遠', '再生', '終始', '反復']],
      ['境界', ['区切り', '接点', '移行', '転機']],
      ['白蛇', ['知恵', '脱皮', '変容', '直感']],
      ['深層', ['潜在', '静寂', '内省', '無意識']],
      ['俯瞰', ['全体', '前提', '初心', '決断']]
    ]
  },
  'meta.introduction': {
    essence: '【創り手（遺されるもの）】想像力や直感を作品へ変える創造、目立たない献身、見過ごされる才能、後世に遺る影響と再発見を象徴する。創り手が得た評価と、その作品が持つ価値は必ずしも一致しない。',
    upright: '【創造の継承】努力や感性が形となり、生み出したものが他者へ届いて受け継がれる。目先の成功や評価を急がず、創造そのものの価値と長く残る影響を大切にする。',
    reversed: '【埋もれた創造】成果や表面的な評価の陰で、貢献や才能が見過ごされている。評価の不足によって本来の価値を見失わず、隠れた努力や創り手を見直す。',
    keywords: [
      ['創造', ['想像', '直感', '表現', '作品']],
      ['献身', ['努力', '支援', '貢献', '陰働き']],
      ['不遇', ['埋没', '軽視', '不理解', '見落し']],
      ['継承', ['遺産', '後世', '影響', '波及']],
      ['再発見', ['再評価', '発掘', '再認識', '価値']]
    ]
  }
});

export function deckASpecialInterpretation(cardId, deckId) {
  if (deckId !== 'A' || !Object.hasOwn(DECK_A_SPECIAL_INTERPRETATIONS, cardId)) return null;
  const { essence, upright, reversed, keywords } = DECK_A_SPECIAL_INTERPRETATIONS[cardId];
  return {
    essence,
    upright,
    reversed,
    keywords: keywords.map(([heading, terms]) => ({ heading, terms: [...terms] }))
  };
}
