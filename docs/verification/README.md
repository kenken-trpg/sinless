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

- 名前: `sweep-ja`、`sweep-en`、`player`、`batch`、`magic`、`samples`、`all`(この 6 本を順に実行)。
- 起動中のワールドがなければ `--world`(既定 `sinless-test`)を起動する。`--no-launch` で起動しない。
- 開始前に、ブラウザーが読み込んでいる system のバージョンと `system.json` を比べ、違えば警告する。
  `/api/status` の値は古いことがあるため使わない。`--relaunch` でワールドを再起動すると、Foundry がマニフェストを読み直す。
- 出力は `--out`(既定 `<tmp>/sinless-verify/<日時>`)の下の `<名前>/`。最後に各スクリプトの成否と所要時間を表示し、1 本でも失敗すれば終了コード 1。
- macOS では実行中だけ `caffeinate -i` でアイドルスリープを止める(スリープすると接続が切れ、シートがタイムアウトする)。
- `npm run check` には含まれない。

## 共通ヘルパー [lib.mjs](lib.mjs)

- `joinGM({ user, viewport })`: 入室して `game.ready` を待つ。`{ browser, page, logs }` を返す。
- `launchWorld(world)`: アクティブなワールドがなければ起動する。
- `relaunchWorld(world)`: ワールドを終了して起動し直す。
- `loadedVersions()`: ブラウザーから見た Foundry・system のバージョン、ワールド、言語。
- `loadChromium()`: 上記の環境変数から Playwright を読み込む。

## 主なスクリプト

| スクリプト | `npm run verify` | 内容 |
|---|---|---|
| `2026-11-06/current/sweep-fixed.mjs <outdir> ja` | `sweep-ja` | 全アクター・アイテムのシート、全タブ、編集可能な全入力欄の総当たり |
| `2026-11-06/current/sweep-fixed-en.mjs <outdir> en` | `sweep-en` | 同じ総当たりを英語で。日本語の文字が残っていれば問題として数える |
| `2026-11-06/current/magic-review.mjs` | `magic` | 魔法拡張(持続呪文、結界、精霊)とリソース保存 |
| `2026-11-06/sample-actors/initial-workflow.mjs` | `samples` | 同梱サンプルアクターの読み込みと主要な判定 |
| `2026-11-06/current/extra.mjs` | `player` | プレイヤー視点(別ブラウザー)と戦闘の進行 |
| `2026-11-06/current/batch.mjs` | `batch` | `original/` の機能別スクリプト 9 本を順に実行。前提データは `current/fixtures.mjs` が作り、出力を `current/batch-checks.mjs` で判定する |
| `2026-11-06/current/sinless-verify.mjs <mode> <arg>` | — | `original/` の旧スクリプトを補正して実行(diagnose / sweep / legacy / batch / extra) |

各スクリプトは作成したテスト用データを終了時に削除する。
`2026-11-06/original/` は当時のスナップショットで、機械固有のパスを含むためそのままでは動かない。
`current/sinless-verify.mjs` と `current/batch.mjs` は、読み込み時にそのパスを `lib.mjs` へ置き換えて実行する。
