import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_DETAILS, cardDetail } from '../web/card-details.js';

test('attachment-backed detail dataset contains exactly the standard 78 cards', () => {
  assert.equal(Object.keys(CARD_DETAILS).length, 78);
  assert.equal(CARD_DETAILS['meta.title'], undefined);
  assert.equal(CARD_DETAILS['meta.guarantee'], undefined);
});

test('detail data preserves supplied essence/upright/reversed wording', () => {
  assert.deepEqual(cardDetail('major.fool'), {
    essence: '自由と好奇心に従い、未知の可能性へ踏み出す',
    upright: '先入観なく新しいことを始める、旅立つ、偶然の流れを楽しむ。',
    reversed: '無計画に飛び出す、現実を見ずに楽観する、落ち着きなく投げ出す。',
    source_url: 'https://sup.andyou.jp/tarot/arcana0/'
  });
  assert.equal(
    cardDetail('minor.pentacles.king').essence,
    '資源・才能・人脈を管理し、持続的な物質的豊かさを築く'
  );
});

test('custom cards do not acquire fabricated attachment meanings', () => {
  assert.equal(cardDetail('meta.title'), null);
  assert.equal(cardDetail('meta.guarantee'), null);
});
