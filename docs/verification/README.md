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

- 名前: `sweep-ja`、`sweep-en`、`player`、`permissions`、`help-window`、`sheet-actions`、`keyboard`、`keyboard-dialogs`、`keyboard-apps`、`color-independence`、`contrast`、`batch`、`magic`、`samples`、`all`(この 14 本を順に実行)。
- 起動中のワールドがなければ `--world`(既定 `sinless-test`)を起動する。`--no-launch` で起動しない。
- 開始前に、ブラウザーが読み込んでいる system のバージョンと `system.json` を比べ、違えば警告する。
  `/api/status` の値は古いことがあるため使わない。`--relaunch` でワールドを再起動すると、Foundry がマニフェストを読み直す。
- アクティブなシーンがなく、キャンバスを使う `magic`・`player`・`help-window` が含まれていれば、開始せずに終了コード 1 で止まる(シーンを有効にしてから実行する)。
- 出力は `--out`(既定 `<tmp>/sinless-verify/<日時>`)の下の `<名前>/`。最後に各スクリプトの成否と所要時間を表示し、1 本でも失敗すれば終了コード 1。
- macOS では実行中だけ `caffeinate -i` でアイドルスリープを止める(スリープすると接続が切れ、シートがタイムアウトする)。
- 全部で約 5 分(2026-11-07、macOS)。以前は約 45 分かかっていた。headless Chromium はゲームキャンバスの WebGL をソフトウェアで描き、そのあいだページが塞がるため、サーバーの応答を受け取るたびに約 300 ms 待っていた。いまは macOS では GPU(Metal)で描き、総当たりではキャンバスを切っている。
- `npm run check` には含まれない。

## 入力欄のアクセシビリティ検証

`keyboard`・`keyboard-apps`・`keyboard-dialogs` は `input-accessibility.mjs` で Chromium のアクセシビリティツリーを読み、表示中の入力欄に名前があること、明示した名前が反映されること、チェック・選択・無効状態が正しく公開されることを確認する。リッチテキスト欄はキーボードで編集を開始し、名前のある複数行テキスト欄として公開され、保存後に編集ボタンへ戻ることも確認する。

`SINLESS_VERIFY_LANGUAGE=en` または `ja` を指定すると、検証用ブラウザーの言語を固定できる。ワールドや普段使うブラウザーの設定は変えない。これはブラウザーが支援技術へ渡す情報の検証であり、VoiceOver・NVDA の実際の音声読み上げの確認は含まない。

## 色に頼らない状態表示の検証

`color-independence` は、色で示している状態が文字や形でも伝わることを確かめる。判定カードのダイスは、成功・振り直しの別が Chromium のアクセシビリティツリーに文字として出ること、ブランドのリソース欄は名前の付いた 1 枚の画像として出て、ダメージは×、影響力は斜線で描かれることを確認する。続いて `forced-colors: active` を模擬し、状態モニターの埋まったマス、成功ダイス、リソースの印、オンの切り替えボタンの下線が消えないことを計算済みスタイルで確認する。Windows のハイコントラスト表示そのものは確認していない。オペレーションの発動中のアラート対応の読み上げ用テキストは、単体テストで確認している。

## 文字のコントラストの検証

`contrast` は、全種類のアクターシートの全タブ、ヘルプ・オペレーション・チェイスの画面、判定ダイアログ、判定カードで、文字のコントラストが WCAG 2.2 の AA 基準(通常の文字は 4.5:1、大きな文字は 3:1)を満たすことを、アプリケーションのダークテーマとライトテーマの両方で確認する。チャットカードの背景は羊皮紙の画像なので、背景色は計算済みスタイルからは取らない。文字を透明にしてスクリーンショットを撮り、各要素の範囲の画素の中央値を背景とする。文字色は計算済みの色に祖先の `opacity` を掛けたもの。入力欄の値とプレースホルダーも対象にし、無効の入力欄とアイコンは除く。スクロールで隠れた要素や、他の要素に覆われた要素は測らない。検証中に変えたテーマ設定は元に戻す。

## 共通ヘルパー [lib.mjs](lib.mjs)

- `joinGM({ user, viewport, browser, noCanvas })`: 入室して `game.ready` を待つ。`{ browser, page, logs }` を返す。
  `browser` を渡すと、起動済みのブラウザーに別のコンテキストで 2 つ目のセッションを足す(Foundry はセッションを Cookie で見分ける)。
  `noCanvas` はそのセッションのゲームキャンバスを切る。トークンを使わないスクリプト向け。
- `launchBrowser()`: headless Chromium を起動する。macOS では GPU で描く。
- `launchWorld(world)`: アクティブなワールドがなければ起動する。
- `relaunchWorld(world)`: ワールドを終了して起動し直す。
- `loadedVersions()`: ブラウザーから見た Foundry・system のバージョン、ワールド、言語、アクティブなシーン。
- `loadChromium()`: 上記の環境変数から Playwright を読み込む。

## 主なスクリプト

| スクリプト | `npm run verify` | 内容 |
|---|---|---|
| `2026-11-06/current/sweep-fixed.mjs <outdir> ja` | `sweep-ja` | 全アクター・アイテムのシート、全タブ、編集可能な全入力欄の総当たり。アイコンだけのボタンに `aria-label` がなければ問題として数える |
| `2026-11-06/current/sweep-fixed.mjs <outdir> en` | `sweep-en` | 同じ総当たりを英語で。日本語の文字が残っていれば問題として数える |
| `2026-11-06/current/magic-review.mjs` | `magic` | 魔法拡張(持続呪文、結界、精霊)とリソース保存 |
| `2026-11-06/sample-actors/initial-workflow.mjs` | `samples` | 同梱サンプルアクターの読み込み(JSON とコンペンディウム「サンプルアクター」の両方。パックの中身が `samples/actors` と一致すること)と主要な判定 |
| `2026-11-06/current/extra.mjs` | `player` | プレイヤー視点(別ブラウザー)と戦闘の進行 |
| `2026-11-07/help.mjs` | `help-window` | ヘルプ画面(ページと言語の切り替え)、GM による Journal への取り込みと更新(GM が足したページは残る)、プレイヤーからの閲覧 |
| `2026-11-07/permissions.mjs` | `permissions` | 他人が所有する文書に触れるプレイヤー操作(ホットシートのフィードバック、体当たり、ブランドのメンバー)が、権限エラーなしで終わること |
| `2026-11-07/sheet-actions.mjs` | `sheet-actions` | アクターシートのボタンを種類ごとに押す。判定はダイアログが開き、状態ゲージの枠や回復ボタンはアクターを変え、アイテム行は編集・切り替え・削除確認、確認ダイアログは閉じれば何も変えない |
| `2026-11-07/keyboard.mjs` | `keyboard` | シートの操作をキーボードで。`data-action` のリンクがフォーカスでき名前を持つこと、Enter と Space で押せること、押したあとシートが描き直されてもフォーカスが同じボタンに戻ることを確かめる。キャラクター全 7 タブに加え、NPC・車両・ブランドと全アイテム種別を入力欄も含め Tab / Shift+Tab で往復する。判定・確認ダイアログ、所持アイテムの編集画面を閉じた後のフォーカスも確認（追加対象は `2026-11-07/keyboard-sheets.mjs`） |
| `2026-11-07/keyboard-dialogs.mjs` | `keyboard-dialogs` | 判定・ダメージ・ドレイン・デジタル4種のダイアログ内でTab / Shift+Tab、入力編集、Space、Enter確定を確認。EscapeとキャンセルのEnter / Spaceではアクターとチャットが変わらないこと、補助判定のキャンセル後に元のボタンへ戻ることも確認 |
| `2026-11-07/keyboard-apps.mjs` | `keyboard-apps` | ヘルプ・オペレーション・チェイスのTab / Shift+Tab移動、Enter / Space操作、状態変更と削除後のフォーカス、子画面・確認ダイアログからの復帰。言語選択はフォーカス中の選択変更で確認。検証後にワールド設定を復元 |
| `2026-11-06/current/batch.mjs` | `batch` | `original/` の機能別スクリプト 9 本を順に実行。前提データは `current/fixtures.mjs` が作り、出力を `current/batch-checks.mjs` で判定する |

総当たりは、シートを `SINLESS_SWEEP_WORKERS`(既定 3)本のセッションに分けて並行に回す。
Foundry は 1 ユーザーにつき 1 セッションしか認めないため、2 本目以降は一時的な GM ユーザー(`SWEEP-<言語> GM <番号>`)で入室し、終了時に削除する。
アクターとその所持アイテムは同じセッションで順に回し、同じシートの再描画が重ならないようにする。

各スクリプトは作成したテスト用データを終了時に削除する。

`batch` は途中で止まっても次の実行で元に戻せるようにしている。前提データを作る前に、アクティブなシーンと Sinless の設定を `<tmp>/sinless-verify/batch-fixtures.json`(`SINLESS_FIXTURE_RECOVERY` で変更可)に書き、作るアクターと SMOKE Scene には `flags.sinless.verifyFixture` に実行 ID を付ける。正常に後片付けが済めばこのファイルを消す。強制終了やスリープで後片付けが走らなかった場合、次の `batch` が開始時にファイルを見つけ、次のものを削除してからシーンと設定を戻す。

- その実行 ID の付いたアクターとシーン
- 実行開始後に作られた `SMOKE ` で始まる名前のアクターと `Chase Pursuer`(各スクリプトが自分で作るもの)
- それらに関わる戦闘とチャット

ファイルに書かれたプロセスがまだ動いていれば、別の `batch` が実行中とみなして止まる。記録のない SMOKE データ(手で作ったもの、この仕組みより前に残ったもの)は自動では消さず、エラーで止まる。手で消すときは、SMOKE Scene がアクティブなシーンになっているので、消した後に元のシーンを有効にし直すこと。復旧でシーンを有効にしたクライアントには `Scene#active` が古いまま残ることがある(Foundry 14.365 で確認)ため、復旧後はページを読み込み直してから現状を記録する。
その後の起動で Foundry のログに `Deleted N orphaned embedded documents from the scenes database` と出るのは想定どおり。リンクしていないトークンの効果を外すと削除印が残り、Foundry はトークンやシーンを削除してもそれを消さず、起動時に掃除する。削除の順序では防げず、害はない(2026-11-07 確認)。
`2026-11-06/original/` は当時のスナップショットで、機械固有のパスを含むためそのままでは動かない。
`current/batch.mjs` は、読み込み時にそのパスを `lib.mjs` へ置き換えて実行する。
あわせて、スクリプト中の固定の待ち時間(`waitForTimeout`)を `SINLESS_BATCH_WAIT` 倍(既定 0.2)に縮める。ただし 500 ms(元の待ちがそれより短ければ元の値)は残す。ダイアログのボタンの直後の待ちは閉じるアニメーションも含むため、縮めすぎると読み取りが早すぎる。当時の待ち時間はソフトウェア描画の遅いキャンバスに合わせたもので、`1` にすると元に戻る。

旧入口の `current/sinless-verify.mjs`(diagnose / sweep / legacy / batch / extra)は 2026-11-07 に削除した。
batch と extra は `npm run verify` の `batch` と `player` で、legacy は `batch` で足りる。sweep が生成した `sweep-fixed.mjs` は、その後直接手を入れて使っている(英語版の `sweep-fixed-en.mjs` は 2026-11-07 に統合した)。
旧入口の出力(`current/*.log`、`shoot-fixed.mjs`)は記録として残す。スクリプト本体は Git の履歴にある。
