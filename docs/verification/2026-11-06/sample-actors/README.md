# サンプルアクターの初回画面検証 / Initial sample actor workflow

記録日: 2026-11-06。対象は v0.13.2 の samples/actors/ と同じ内容(03 は侵入プログラム込みの 5 アイテム)。

- 実行: `node docs/verification/2026-11-06/sample-actors/initial-workflow.mjs`
- 前提: http://localhost:30000 で Foundry が起動し、Gamemaster で入室できること。
  Playwright の読み込み先は [../original/lib.mjs](../original/lib.mjs) を参照。
- 出力: スクリーンショットと results.json は `SINLESS_REVIEW_OUT`(既定 /private/tmp/sinless-sample-review)。
  記録した結果は初回が [initial-workflow-results.json](initial-workflow-results.json)、
  v0.13.2 での再実行が [rerun-0.13.2-results.json](rerun-0.13.2-results.json)。

## 初回の結果(記録時点)

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

## v0.13.2 での再実行(2026-11-07)

ワールドを再起動して `game.system.version` 0.13.2 を確認してから実行。全 24 手順が成功し、
コンソールエラー・ページエラーなし。後片付けも完了。

初回の失敗と未実行はスクリプト側の問題で、system の不具合ではなかった。次の 3 点を修正した:

- 召喚判定: ダイアログ送信は画面内で完結するのに、Playwright がクリック後のナビゲーションを待っていた。
  クリックに `noWaitAfter` を指定。召喚単体の再現では、カード作成・ページ遷移なしを確認。
- 戦闘参加者・ターゲット: `scene.tokens.contents` の順序は作成順ではないため、
  `slice(0,4)` と `contents[3]` では 01 が戦闘から外れたり、04 以外を狙ったりすることがあった。
  アクター ID でトークンを選ぶよう修正。
- プール回復: 回復は updateCombat フック内で行われ、`nextRound()` はそれを待たない。
  回復を最大 5 秒待つよう修正(実測 373 ms)。

参考: 表示中ではない Combat を更新すると、Foundry 14.365 本体の `CombatTracker._onRender` で
`Cannot use 'in' operator to search for 'turn' in undefined` が出る。system のコードは関与しない。
今回の再実行ではシーンを表示しているため発生していない。
