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

## 共通ヘルパー [lib.mjs](lib.mjs)

- `joinGM({ user, viewport })`: 入室して `game.ready` を待つ。`{ browser, page, logs }` を返す。
- `launchWorld(world)`: アクティブなワールドがなければ起動する。
- `loadChromium()`: 上記の環境変数から Playwright を読み込む。

## 主なスクリプト

| スクリプト | 内容 |
|---|---|
| `2026-11-06/current/sweep-fixed.mjs <outdir> <lang>` | 全アクター・アイテムのシート、全タブ、編集可能な全入力欄の総当たり |
| `2026-11-06/current/magic-review.mjs` | 魔法拡張(持続呪文、結界、精霊)とリソース保存 |
| `2026-11-06/current/sinless-verify.mjs <mode> <arg>` | `original/` の旧スクリプトを補正して実行(diagnose / sweep / legacy / batch / extra) |
| `2026-11-06/sample-actors/initial-workflow.mjs` | 同梱サンプルアクターの読み込みと主要な判定 |
| `2026-11-06/current/extra.mjs` | プレイヤー視点(別ブラウザー)と戦闘の進行 |
| `2026-11-06/current/batch.mjs` | `original/` の機能別スクリプト 9 本を順に実行。前提データは `current/fixtures.mjs` が作る |

各スクリプトは作成したテスト用データを終了時に削除する。
`2026-11-06/original/` は当時のスナップショットで、機械固有のパスを含むためそのままでは動かない。
`current/sinless-verify.mjs` と `current/batch.mjs` は、読み込み時にそのパスを `lib.mjs` へ置き換えて実行する。
