import { REMAINING_KEYWORD_GRIDS } from './card-keyword-corpus.js';

// #28: Japanese tarot quick-reference headings and terms are compact nouns.
// 2–3 characters by default; hard maximum 6. Editorial source: Tarotoo MIT.
// No third-party attachment-derived diagrams or original selection/arrangement.
// Five initial card records are maintained here; the other 73 are in card-keyword-corpus.js.

export const KEYWORD_GRID_DRAFTS = Object.freeze({
  'major.fool': [["出発",["始まり","未知","一歩","新天地"]],["自由",["解放","自立","奔放","柔軟"]],["冒険",["挑戦","探検","経験","発見"]],["感性",["好奇","直感","遊心","天真"]],["軽率",["無謀","油断","逸脱","迷走"]]],
  'major.death': [["終幕",["終結","区切り","別離","決着"]],["変容",["転換","変革","更新","一新"]],["放棄",["執着","整理","決別","解消"]],["再生",["再出発","新生","復活","転機"]],["抵抗",["停滞","未練","拒絶","固執"]]],
  'major.devil': [["欲望",["物欲","渇望","肉欲","強欲"]],["誘惑",["快楽","刺激","陶酔","享楽"]],["悪習",["依存","中毒","反復","堕落"]],["束縛",["支配","拘束","抑圧","隷属"]],["解放",["脱却","自覚","断絶","自制"]]],
  'minor.swords.3': [["悲嘆",["失恋","哀傷","落涙","傷心"]],["真相",["事実","発覚","直面","理解"]],["亀裂",["不和","離別","裏切り","対立"]],["失意",["挫折","不採用","批判","落胆"]],["回復",["受容","赦し","慰藉","再起"]]],
  'minor.cups.ace': [["恋情",["恋愛","好意","親愛","初恋"]],["感情",["喜悦","共感","慈愛","温情"]],["親交",["新縁","信頼","親密","交流"]],["創造",["着想","感性","芸術","充足"]],["閉塞",["抑圧","空虚","孤立","拒絶"]]]
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
