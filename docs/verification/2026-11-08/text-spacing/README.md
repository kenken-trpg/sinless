# 文字間隔と文字拡大の検証（2026-11-08）

Foundry 14.365、system 0.15.13、テストワールド `sinless-test`、Chromium、ビューポート 1600×1100。テストワールドを再起動し、読み込まれた system のバージョンを確認した。

ボタンの固定の高さを解除し、ラベルの折り返しに合わせて伸びるようにした。チャットカードの見出しは折り返し、目標値は文字を分断せず次の行へ移る。

`text-spacing` は行の高さ 1.5、段落後の間隔 2em、文字間隔 0.12em、単語間隔 0.16em を適用する。`text-resize` はルートの文字サイズを 16px から 32px に変更する。どちらも各アクターのタブ、武器シート、ヘルプ・オペレーション・チェイス、判定ダイアログ、チャットカードを対象とする。選択欄などの文字幅の測定には文字と単語の間隔も含める。

検証は内容の横切れ、縦切れ、文字のクリップ、狭すぎる列、ボックスからの文字のはみ出しを測定する。全種類のアイテムや全種類のダイアログを網羅する検証ではなく、WCAG 全体への適合判定でもない。

実行コマンド（既存の Playwright を `SINLESS_PLAYWRIGHT` に指定）:

```sh
npm run verify -- text-spacing text-resize target-size --relaunch --out /private/tmp/sinless-text-spacing-final-ja
SINLESS_VERIFY_LANGUAGE=en npm run verify -- text-spacing text-resize target-size --out /private/tmp/sinless-text-spacing-final-en
```

結果は同じフォルダーの `ja-*.json` と `en-*.json` に保存。文字拡大・文字間隔の検証では、作成したアクターと自分で作成したチャットメッセージを削除し、UI 設定を復元したことも確認する。

| 検証 | 日本語 | 英語 |
|---|---|---|
| 文字間隔 | 24画面、問題0 | 24画面、問題0 |
| 200%文字拡大 | 24画面、問題0 | 24画面、問題0 |
| 操作対象サイズ | 49画面・1,810箇所、問題0 | 49画面・1,809箇所、問題0 |

全実行でページエラー0、後片付けと設定復元に成功。`npm run check` も成功（151テスト、翻訳キー整合性、165ファイルの構文）。
