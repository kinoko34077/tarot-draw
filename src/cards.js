const MAJOR = [
  ['fool', 'The Fool', '愚者'],
  ['magician', 'The Magician', '魔術師'],
  ['high-priestess', 'The High Priestess', '女教皇'],
  ['empress', 'The Empress', '女帝'],
  ['emperor', 'The Emperor', '皇帝'],
  ['hierophant', 'The Hierophant', '教皇'],
  ['lovers', 'The Lovers', '恋人'],
  ['chariot', 'The Chariot', '戦車'],
  ['strength', 'Strength', '力'],
  ['hermit', 'The Hermit', '隠者'],
  ['wheel-of-fortune', 'Wheel of Fortune', '運命の輪'],
  ['justice', 'Justice', '正義'],
  ['hanged-man', 'The Hanged Man', '吊るされた男'],
  ['death', 'Death', '死神'],
  ['temperance', 'Temperance', '節制'],
  ['devil', 'The Devil', '悪魔'],
  ['tower', 'The Tower', '塔'],
  ['star', 'The Star', '星'],
  ['moon', 'The Moon', '月'],
  ['sun', 'The Sun', '太陽'],
  ['judgement', 'Judgement', '審判'],
  ['world', 'The World', '世界']
].map(([slug, name_en, name_ja], number) => ({
  card_id: `major.${slug}`,
  arcana: 'major',
  number,
  name_en,
  name_ja
}));

const SUITS = [
  ['wands', 'Wands', 'ワンド'],
  ['cups', 'Cups', 'カップ'],
  ['swords', 'Swords', 'ソード'],
  ['pentacles', 'Pentacles', 'ペンタクル']
];

const RANKS = [
  ['ace', 'Ace', 'エース'],
  ['2', 'Two', '2'],
  ['3', 'Three', '3'],
  ['4', 'Four', '4'],
  ['5', 'Five', '5'],
  ['6', 'Six', '6'],
  ['7', 'Seven', '7'],
  ['8', 'Eight', '8'],
  ['9', 'Nine', '9'],
  ['10', 'Ten', '10'],
  ['page', 'Page', 'ペイジ'],
  ['knight', 'Knight', 'ナイト'],
  ['queen', 'Queen', 'クイーン'],
  ['king', 'King', 'キング']
];

const MINOR = SUITS.flatMap(([suitId, suitEn, suitJa]) =>
  RANKS.map(([rankId, rankEn, rankJa]) => ({
    card_id: `minor.${suitId}.${rankId}`,
    arcana: 'minor',
    suit: suitId,
    rank: rankId,
    name_en: `${rankEn} of ${suitEn}`,
    name_ja: `${suitJa}の${rankJa}`
  }))
);

const TITLE = {
  card_id: 'meta.title',
  arcana: 'meta',
  sequence_hint: 'before-fool',
  name_en: 'Title Card',
  name_ja: 'タイトルカード'
};

const GUARANTEE = {
  card_id: 'meta.guarantee',
  arcana: 'meta',
  symbolic_number: 22,
  sequence_hint: 'after-world',
  name_en: 'GUARANTEE',
  name_ja: 'GUARANTEE（保証カード）'
};

export const CARD_CATALOG = Object.freeze([
  TITLE,
  ...MAJOR,
  GUARANTEE,
  ...MINOR
].map(card => Object.freeze({ ...card })));

export const CARD_COUNT = CARD_CATALOG.length;

/** Immutable public card identities differ across physical deck variants.
 * The intro is a distinct card, not a renamed GUARANTEE draw.
 * Future user-supplied art can be attached without changing these IDs.
 */
export function cardsForDeck(deckId = 'B', includeCustom = true) {
  const catalog = includeCustom ? CARD_CATALOG : CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
  if (!includeCustom || deckId === 'B') return catalog;
  return catalog.map(card => card.card_id === 'meta.guarantee' ? Object.freeze({
    card_id: 'meta.introduction',
    name_en: 'Pamela Colman Smith Introduction Card',
    name_ja: 'パメラ・コールマン・スミス紹介カード'
  }) : card);
}
