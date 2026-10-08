import { REMAINING_KEYWORD_GRIDS } from './card-keyword-corpus.js';

// Issue #26: original Japanese keyword-grid content, informed by Tarotoo's MIT data.
// Never reproduce the unlicensed attachment's 22-card 5x4 heading/term selection or diagrams.
// Source: https://github.com/Tarotoo-com/tarotoo-tarot-dataset (MIT, © 2026 Tarotoo).
// Field-level editorial rationale: docs/KEYWORD_W1_REVIEW.md.
// The original five prototypes are retained here; other 73 independently authored records live in card-keyword-corpus.js.
export const KEYWORD_GRID_DRAFTS = Object.freeze({
  'major.fool': [
    ['始まりの局面', ['新たな道を選ぶ', '白紙の可能性', '経験の第一歩', '未知との出会い']],
    ['身軽な選択', ['型にとらわれない', '自由に動く', '発想を広げる', '自分の足で進む']],
    ['挑戦と学習', ['まず試してみる', '失敗から覚える', '慣れない環境', '進みながら学ぶ']],
    ['心の開放', ['好奇心を持つ', '遊び心を保つ', '直感に従う', '新しい縁を迎える']],
    ['準備との均衡', ['無謀さに気づく', '判断を急がない', 'ためらいを越える', '変化への不安']]
  ],
  'major.death': [
    ['ひとつの終幕', ['役割を終える', '関係の一区切り', '旧段階に幕を引く', '節目を迎える']],
    ['変化の核心', ['形を変える', '価値観を改める', '以前と異なる道', '不可逆な転換']],
    ['手放す過程', ['過去を整理する', '不要なものを離す', '執着をほどく', '余白を生み出す']],
    ['更新の契機', ['新たな段階', '次の役割を探す', '関係を組み直す', '再び歩み始める']],
    ['変化への抵抗', ['終結を先延ばし', '現状にとどまる', '区切りを拒む', '未完の別れ']]
  ],
  'major.devil': [
    ['離れがたい欲求', ['過度な所有欲', '対象への依存', '手放せぬ習慣', '執着の自覚']],
    ['目先の誘惑', ['即時の満足', '強い衝動', '刺激を追う', '長期目標を忘れる']],
    ['繰り返す悪循環', ['不健全な習慣', '無理を重ねる', '同じ失敗に戻る', '欲望に流される']],
    ['制約と力関係', ['不均衡な支配', '窮屈な環境', '選択肢の狭まり', '仕事上の束縛']],
    ['束縛からの回復', ['仕組みを見抜く', '境界線を引く', '主導権を取り戻す', '依存を断ち切る']]
  ],
  'minor.swords.3': [
    ['痛みと喪失', ['胸を刺す悲しみ', '別れの痛み', '期待の崩壊', '悲嘆の時間']],
    ['明らかになる事実', ['厳しい知らせ', '避けられない真相', '現実への直面', 'つらい理解']],
    ['関係の亀裂', ['信頼の損傷', '離れていく相手', 'すれ違いの蓄積', '対立の深まり']],
    ['仕事上の失意', ['不採用の知らせ', '厳しい指摘', '職場での衝突', '計画の挫折']],
    ['傷からの回復', ['悲しみを認める', '許しを考える', '過去を解き放つ', '回復に向かう']]
  ],
  'minor.cups.ace': [
    ['愛情の芽吹き', ['恋が始まる', '好意を受け取る', '心を開く', '温かな親愛']],
    ['豊かな感情', ['共感が深まる', '感受性が育つ', '思いやりの循環', '喜びを分かつ']],
    ['人とのつながり', ['新しい縁', '信頼の入口', '感情を伝える', '親密さの広がり']],
    ['創造と内面', ['創作への着想', '心躍る仕事', '精神的な開放', '内なる充足']],
    ['閉じた感情', ['気持ちを抑える', '虚しさを抱える', '喜びを受け取れない', '自分をいたわる']]
  ]
});

// Exactly the standard 78 cards. Special Title/GUARANTEE cards have no divinatory meanings.
export const CARD_KEYWORD_GRIDS = Object.freeze({
  ...KEYWORD_GRID_DRAFTS,
  ...REMAINING_KEYWORD_GRIDS
});

export function keywordGridDraft(cardId) {
  const groups = Object.hasOwn(CARD_KEYWORD_GRIDS, cardId) ? CARD_KEYWORD_GRIDS[cardId] : null;
  if (!groups) return null;
  return groups.map(([heading, terms]) => ({
    heading,
    terms: [...terms]
  }));
}
