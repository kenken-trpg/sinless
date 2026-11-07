# 日本語の総当たり / Japanese sheet sweep

記録日: 2026-11-07。Foundry 14.365、ワールド sinless-test、system 0.13.2(main ab9eb28 + 検証ヘルパー整理)。

- 実行: `node docs/verification/2026-11-06/current/sweep-fixed.mjs <outdir> ja`
  (`SINLESS_PLAYWRIGHT` の設定は [../../README.md](../../README.md) を参照)
- 結果: [report-ja.json](report-ja.json)

## 事前の整理

実行前に、過去の検証の残留物(Actor 25、ワールド直下 Item 35、チャット 126、SMOKE Scene)を
JSON に退避してから削除した。残したのは Gamemaster ユーザーと既定シーンのみ。

## 結果

全 30 シートで問題なし(未翻訳キー・undefined 等の表示、保存の不一致、コンソールエラー、クラッシュいずれも 0)。

| 対象 | 入力欄 |
|---|---|
| キャラクター | 130/130 |
| NPC / ネットワーク実体 / 精霊 | 107/107、106/106、107/107 |
| 乗り物 / ブランド | 13/13(skipped 1)、13/13 |
| アイテム 12 種 × 埋め込み・ワールド直下 | すべて全欄一致 |

以前失敗していた resource は、埋め込み・ワールド直下とも 17/17 保存できた。

skipped は、値の変更先がない入力欄(乗り物 1、power 6)。条件によって表示されない入力欄は対象外のため、
全条件分岐の網羅ではない。

実行後、作成した Actor・Item はすべて削除され、ワールドは空の状態に戻った。
