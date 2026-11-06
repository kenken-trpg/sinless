# サンプルアクターの初回画面検証 / Initial sample actor workflow

記録日: 2026-11-06。対象は v0.13.2 の samples/actors/ と同じ内容(03 は侵入プログラム込みの 5 アイテム)。

- 実行: `node docs/verification/2026-11-06/sample-actors/initial-workflow.mjs`
- 前提: http://localhost:30000 で Foundry が起動し、Gamemaster で入室できること。
  Playwright の読み込み先は [../original/lib.mjs](../original/lib.mjs) を参照。
- 出力: スクリーンショットと results.json は `SINLESS_REVIEW_OUT`(既定 /private/tmp/sinless-sample-review)。
  記録した結果は [initial-workflow-results.json](initial-workflow-results.json)。

## 結果

環境: Foundry 14.365、ワールド sinless-test。`game.system.version` は 0.6.0 と表示された。
サーバーが古いマニフェストを保持していた可能性があり、現行ソースでの検証としては未確定。

成功:
- 6 アクターの importFromJSON(invalid なし、アイテム数一致)
- リガー設定、ブランドメンバー 3 名、トークン配置
- 戦闘開始、銃撃カード、NPC の固定ソーク、物理ダメージ反映
- 攻撃呪文とドレイン、持続呪文のカード

失敗:
- 召喚判定: ロールボタンのクリック後、Playwright のナビゲーション待ちで 20 秒タイムアウト。
  システム側の不具合かスクリプト側の待ち方の問題かは未切り分け。

未実行(失敗で停止したため):
- 儀式、デジタル攻撃 3 種、乗り物の機動・搭載武器、ブランドのセクター行動、ラウンド経過によるプール回復

後片付け: 作成したアクター・シーン・戦闘・チャットはすべて削除済み。
