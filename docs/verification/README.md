# Foundry 画面検証 / Browser verification

実際の Foundry VTT にブラウザーで入室し、シートや判定を操作する検証スクリプト。
`npm test` には含まれない。日付ごとのフォルダーに、スクリプトと結果の記録を置く。

## 準備

- Foundry を起動し、Sinless のワールド(既定 `sinless-test`)を起動する。
  起動していなければ `lib.mjs` の `launchWorld()` で起動できる。
- Gamemaster ユーザーにパスワードがないこと。
- Playwright はこのプロジェクトの依存に含めていない。手元の Playwright を指定する:

```sh
export SINLESS_PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs
export SINLESS_FOUNDRY_URL=http://localhost:30000   # 省略時の既定値
```

## npm から実行

```sh
npm run verify -- list                 # 一覧
npm run verify -- batch player         # 複数指定は順に実行
npm run verify -- all --relaunch       # ワールドを再起動してから全部
```

- 名前: `sweep-ja`、`sweep-en`、`player`、`permissions`、`help-window`、`sheet-actions`、`batch`、`magic`、`samples`、`all`(この 9 本を順に実行)。
- 起動中のワールドがなければ `--world`(既定 `sinless-test`)を起動する。`--no-launch` で起動しない。
- 開始前に、ブラウザーが読み込んでいる system のバージョンと `system.json` を比べ、違えば警告する。
  `/api/status` の値は古いことがあるため使わない。`--relaunch` でワールドを再起動すると、Foundry がマニフェストを読み直す。
- 出力は `--out`(既定 `<tmp>/sinless-verify/<日時>`)の下の `<名前>/`。最後に各スクリプトの成否と所要時間を表示し、1 本でも失敗すれば終了コード 1。
- macOS では実行中だけ `caffeinate -i` でアイドルスリープを止める(スリープすると接続が切れ、シートがタイムアウトする)。
- 全部で約 3 分(2026-11-07、macOS)。以前は約 45 分かかっていた。headless Chromium はゲームキャンバスの WebGL をソフトウェアで描き、そのあいだページが塞がるため、サーバーの応答を受け取るたびに約 300 ms 待っていた。いまは macOS では GPU(Metal)で描き、総当たりではキャンバスを切っている。
- `npm run check` には含まれない。

## 共通ヘルパー [lib.mjs](lib.mjs)

- `joinGM({ user, viewport, browser, noCanvas })`: 入室して `game.ready` を待つ。`{ browser, page, logs }` を返す。
  `browser` を渡すと、起動済みのブラウザーに別のコンテキストで 2 つ目のセッションを足す(Foundry はセッションを Cookie で見分ける)。
  `noCanvas` はそのセッションのゲームキャンバスを切る。トークンを使わないスクリプト向け。
- `launchBrowser()`: headless Chromium を起動する。macOS では GPU で描く。
- `launchWorld(world)`: アクティブなワールドがなければ起動する。
- `relaunchWorld(world)`: ワールドを終了して起動し直す。
- `loadedVersions()`: ブラウザーから見た Foundry・system のバージョン、ワールド、言語。
- `loadChromium()`: 上記の環境変数から Playwright を読み込む。

## 主なスクリプト

| スクリプト | `npm run verify` | 内容 |
|---|---|---|
| `2026-11-06/current/sweep-fixed.mjs <outdir> ja` | `sweep-ja` | 全アクター・アイテムのシート、全タブ、編集可能な全入力欄の総当たり |
| `2026-11-06/current/sweep-fixed.mjs <outdir> en` | `sweep-en` | 同じ総当たりを英語で。日本語の文字が残っていれば問題として数える |
| `2026-11-06/current/magic-review.mjs` | `magic` | 魔法拡張(持続呪文、結界、精霊)とリソース保存 |
| `2026-11-06/sample-actors/initial-workflow.mjs` | `samples` | 同梱サンプルアクターの読み込みと主要な判定 |
| `2026-11-06/current/extra.mjs` | `player` | プレイヤー視点(別ブラウザー)と戦闘の進行 |
| `2026-11-07/help.mjs` | `help-window` | ヘルプ画面(ページと言語の切り替え)、GM による Journal への取り込みと更新(GM が足したページは残る)、プレイヤーからの閲覧 |
| `2026-11-07/permissions.mjs` | `permissions` | 他人が所有する文書に触れるプレイヤー操作(ホットシートのフィードバック、体当たり、ブランドのメンバー)が、権限エラーなしで終わること |
| `2026-11-07/sheet-actions.mjs` | `sheet-actions` | アクターシートのボタンを種類ごとに押す。判定はダイアログが開き、状態ゲージの枠や回復ボタンはアクターを変え、アイテム行は編集・切り替え・削除確認、確認ダイアログは閉じれば何も変えない |
| `2026-11-06/current/batch.mjs` | `batch` | `original/` の機能別スクリプト 9 本を順に実行。前提データは `current/fixtures.mjs` が作り、出力を `current/batch-checks.mjs` で判定する |

総当たりは、シートを `SINLESS_SWEEP_WORKERS`(既定 3)本のセッションに分けて並行に回す。
Foundry は 1 ユーザーにつき 1 セッションしか認めないため、2 本目以降は一時的な GM ユーザー(`SWEEP-<言語> GM <番号>`)で入室し、終了時に削除する。
アクターとその所持アイテムは同じセッションで順に回し、同じシートの再描画が重ならないようにする。

各スクリプトは作成したテスト用データを終了時に削除する。
その後の起動で Foundry のログに `Deleted N orphaned embedded documents from the scenes database` と出るのは想定どおり。リンクしていないトークンの効果を外すと削除印が残り、Foundry はトークンやシーンを削除してもそれを消さず、起動時に掃除する。削除の順序では防げず、害はない(2026-11-07 確認)。
`2026-11-06/original/` は当時のスナップショットで、機械固有のパスを含むためそのままでは動かない。
`current/batch.mjs` は、読み込み時にそのパスを `lib.mjs` へ置き換えて実行する。
あわせて、スクリプト中の固定の待ち時間(`waitForTimeout`)を `SINLESS_BATCH_WAIT` 倍(既定 0.2)に縮める。当時の待ち時間はソフトウェア描画の遅いキャンバスに合わせたもので、`1` にすると元に戻る。

旧入口の `current/sinless-verify.mjs`(diagnose / sweep / legacy / batch / extra)は 2026-11-07 に削除した。
batch と extra は `npm run verify` の `batch` と `player` で、legacy は `batch` で足りる。sweep が生成した `sweep-fixed.mjs` は、その後直接手を入れて使っている(英語版の `sweep-fixed-en.mjs` は 2026-11-07 に統合した)。
旧入口の出力(`current/*.log`、`shoot-fixed.mjs`)は記録として残す。スクリプト本体は Git の履歴にある。
