# 公開サーバー体験用アクター / Public server sample actors

Sinless 用の架空の動作確認データです。装備名・数値はテスト用で、公式データや作成ルールに準拠したプリジェネではありません。ルールブックの本文は含みません。

Fictional test fixtures for Sinless, including embedded equipment. These are not official characters or rules-legal starting builds, and contain no rulebook text.

## ワールドへの取り込み / Bringing them into a world

システムにコンペンディウム「サンプルアクター」として同梱しています。GM がサイドバーのコンペンディウムタブで開き、使うアクターをアクターディレクトリへドラッグします。パックを右クリックして「全てをインポート」を選べば、6 体をまとめて取り込めます。取り込んだアクターはワールドのコピーなので、自由に変更して構いません。

The system ships them as the **Sample actors** compendium. As GM, open it in the Compendium tab of the sidebar and drag the actors you want into the Actors directory, or right-click the pack and choose Import All to bring in all six. The imported actors are world copies, free to change.

### JSON から読み込む場合 / From the JSON files

同じアクターを、配布 ZIP の `samples/actors/` に JSON でも入れています。システムをインストールしたサーバーでは、Foundry の公開 URL を基準に `systems/sinless/samples/actors/01-combat-character.json` などからも取得できます。サブパスを使うサーバーではそのパスの後ろに付けてください。

GM がアクターディレクトリで、対応する種類の空アクターを新規作成し、そのアクターの右クリックメニュー「データのインポート」から JSON を選びます。1 ファイルにつき 1 アクターです。既存のプレイ用アクターへのインポートはデータを置き換えるため、必ず体験用に新規作成してください。

プレイヤーに操作してもらうキャラクターは、GM がアクターの権限設定で、そのユーザーを「所有者」にしてください。NPC は GM が操作します。JSON にユーザー ID や所有権は含めていません。

The same actors are in the release ZIP as JSON under `samples/actors/`. On an installed server, files are also available relative to the Foundry public URL, for example `systems/sinless/samples/actors/01-combat-character.json` (preserve any server URL prefix). As GM, create a fresh actor of the matching type in the Actors directory, then use its context menu → Import Data and select one JSON per actor. Import replaces the destination actor's data, so use new demo actors.

Grant each player Owner permission on their demo character; the GM controls the NPC. No user IDs or ownership grants are included.

| JSON | 作成する種類 / Type | 試す内容 / Try |
| --- | --- | --- |
| [01-combat-character.json](actors/01-combat-character.json) | character | 射撃、近接、防具、リコイル、VCR / Weapons, armor, recoil, VCR |
| [02-magic-character.json](actors/02-magic-character.json) | character | 攻撃・持続呪文、ドレイン、召喚判定、儀式 / Spells, drain, summoning roll, ritual |
| [03-decker-character.json](actors/03-decker-character.json) | character | MCP、攻撃ソフト3種、アラート軽減 / MCP, three digital attacks, alert reduction |
| [04-training-npc.json](actors/04-training-npc.json) | npc | 固定攻撃・防御ダイス、ダメージ反映 / Fixed attack/defense dice, damage |
| [05-test-vehicle.json](actors/05-test-vehicle.json) | vehicle | リガー割当、機動、搭載武器 / Rigger assignment, maneuvers, mounted weapon |
| [06-test-brand.json](actors/06-test-brand.json) | brand | リソース、アセット、セクター行動 / Resource, asset, sector actions |

## 10分程度の確認手順 / Short walkthrough

1. **戦闘**：01 と 04 をシーンへ配置。GM が戦闘に追加して開始し、01 の所有者が 04 をターゲットして銃を振ります。防御・ソークとダメージ反映を確認し、次のラウンドでプール回復を確認します。戦闘外と戦闘中では判定モードが変わります。
2. **魔法**：02 から 04 に攻撃呪文を使用し、抵抗とドレインを確認。持続呪文ではチャットカードから効果を適用し、抵抗で解除できることを確認します。レイラインの設定も試せます。召喚判定はそのまま試せますが、精霊トークンを配置するには別途精霊用 NPC を作り、召喚アイテムのアクター参照を設定してください。04 は精霊ではありません。
3. **グリッド**：03 のグリッドタブで装備中のデッキとソフトを確認。侵入プログラムを読み込み済みなので、機器・NANへのハックも試せます。04 をターゲットして攻撃ソフトを使用し、チャットのダメージ処理を試します。凝集ダメージ専用の相手を試す場合は、04 を複製してネットワーク実体を有効にし、ハードニングを設定してください。
4. **乗り物**：05 のシートへ 01 をドロップしてリガーに設定。01 に所有権のあるプレイヤーには 05 にも所有権を与え、機動と搭載武器を試します。
5. **ブランド**：06 のメンバータブへ 01〜03 をドロップして、メンバー・アセット・セクター行動を確認。ターン終了は資金・生活費を変更するため、体験データで実行します。

1. **Combat:** Place 01 and 04 on a scene. As GM, add them to combat and start it. The owner of 01 targets 04 and rolls a weapon attack. Try defense, soak and applying damage, then advance to the next round to check pool recovery. Test mode differs outside combat.
2. **Magic:** Use 02 against 04; try spell resistance, drain, sustained effects and ley-line settings. Summoning rolls work immediately; placing a spirit token requires a separate spirit NPC linked in the summoning item. Actor 04 is not a spirit.
3. **Grid:** Open 03's Grid tab and check its equipped deck and loaded software. A base hacking program is included for device and NAN tests. Target 04 and try digital attack cards. To test cohesion-only damage, duplicate 04, enable Network Entity and set hardening.
4. **Vehicle:** Drop 01 onto 05's sheet to assign the rigger. Grant the player ownership of both actors, then try maneuvers and the mounted weapon.
5. **Brand:** Drop 01–03 into 06's Members tab and try assets and sector actions. Ending a sector turn changes money and lifestyle balances; use demo data.

アクター間の参照はインポート先で設定します。体験後はアクターとシーン上のトークンを削除できます。ワールド設定（難易度、アラート、ヒート等）を変更した場合は GM が戻してください。問題報告にはシステム／Foundry のバージョン、使用 JSON、操作、期待結果と実際の結果を添えてください。

Actor links must be assigned after import. Remove demo actors and scene tokens when finished, and restore any world settings changed during testing (difficulty, alert, heat). Reports should include system/Foundry versions, JSON filename, steps, expected result and actual result.
