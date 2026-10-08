// Issue #26 W1: five-card ORIGINAL Japanese editorial prototypes from Tarotoo's MIT data.
// Do not copy or adapt the unlicensed Tarot Palette diagrams or the attachment's
// distinctive 22-card heading/keyword selection. Broad conventional tarot themes
// guide semantic-coverage checks only; independently compose every public label
// from licensed source data. This is a draft, not a final 78-card data set.
// Source: https://github.com/Tarotoo-com/tarotoo-tarot-dataset (MIT, © 2026 Tarotoo).
// Preserve docs/third-party/TAROTOO-LICENSE.txt for source license terms.
export const KEYWORD_GRID_DRAFTS = Object.freeze({
  'major.fool': [
    ['新しい局面', ['始まりの合図', '白紙からの出発', '先の見えない道', '可能性を探る']],
    ['自由な姿勢', ['枠に縛られない', '自然な選択', '心を開く', '柔軟な行動']],
    ['未知への挑戦', ['一歩を踏み出す', '冒険を選ぶ', '経験から学ぶ', '道中を信頼する']],
    ['感性の動き', ['好奇心が芽生える', '素直な反応', '遊び心', '直観に耳を傾ける']],
    ['自由な発想', ['前例に頼りすぎない', '自分なりの着想', '遊び心を生かす', '個性を発揮する']]
  ],
  'major.death': [
    ['節目と終了', ['幕を下ろす', '古い段階の終点', '区切りを受け入れる', '役割が終わる']],
    ['変容の過程', ['状態が変わる', '次の形へ移る', '価値観の転換', '以前とは異なる道']],
    ['手放す姿勢', ['不要なものを離す', '過去を整理する', '執着をほどく', '空白をつくる']],
    ['再出発の余地', ['新しい段階', '更新される関係', '方向の選び直し', '再び動き始める']],
    ['転機を受け入れる', ['区切りに向き合う', '移り変わりを認める', '去るものを見送る', '次へ進む準備']]
  ],
  'major.devil': [
    ['執着の力', ['離れがたい対象', '所有への欲求', '必要以上の依存', '手放せない習慣']],
    ['誘惑の作用', ['目先の魅力', '即時の満足', '強い衝動', '選択を惑わす']],
    ['不健全な循環', ['同じ行動を反復', '悪循環の自覚', '無理を重ねる', '欲望に振り回される']],
    ['束縛の構造', ['抜けにくい状況', '力関係の偏り', '身動きの取りづらさ', '狭まる選択肢']],
    ['欲求に支配される', ['刺激を追い続ける', '目先の満足に偏る', '誘惑に流される', '自分を見失う']]
  ],
  'minor.swords.3': [
    ['心の傷', ['悲しみが深まる', '喪失の痛み', '傷ついた気持ち', '別れの余韻']],
    ['明らかな現実', ['つらい事実', '隠せない問題', '避けられない対話', '苦しい理解']],
    ['関係の断絶', ['距離が生じる', '信頼が揺らぐ', '衝突のあと', '孤立の感覚']],
    ['気持ちの動揺', ['心が落ち着かない', '考えがまとまらない', '不安が広がる', '傷に意識が向く']],
    ['関係の摩擦', ['意見がぶつかる', '互いに距離を置く', '気持ちがすれ違う', '対立が深まる']]
  ],
  'minor.cups.ace': [
    ['愛情の芽生え', ['新しい好意', '心が開かれる', '親愛が深まる', '満ちる思いやり']],
    ['感情の始まり', ['気持ちが動く', '温かな予感', '素直な感情', '共感の広がり']],
    ['心が満たされる', ['喜びがあふれる', '気持ちを受け取る', '親しみが広がる', '豊かなつながり']],
    ['感情の波', ['思いがあふれる', '感受性が高まる', '期待がふくらむ', '気持ちが揺れ動く']],
    ['閉ざされた心', ['感情の抑圧', '空虚な状態', '失った感覚', '自分へのいたわり不足']]
  ]
});

export function keywordGridDraft(cardId) {
  const groups = KEYWORD_GRID_DRAFTS[cardId];
  if (!groups) return null;
  return groups.map(([heading, terms]) => ({
    heading,
    terms: [...terms]
  }));
}
