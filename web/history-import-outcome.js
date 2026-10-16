// Import display state is not proof that localStorage committed it.
export function historyImportOutcome(saved) {
  return saved
    ? { clearInput: true, message: '読み込みました。このブラウザに保存しました。' }
    : { clearInput: false, message: '読み込みましたが、ブラウザへ保存できませんでした。元の文章を残しています。コピーして保管してください。' };
}
