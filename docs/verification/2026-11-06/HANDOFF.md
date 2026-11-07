# Sinless 開発・検証の引き継ぎ記録

記録日: 2026-11-06 21:24 JST（確認時点）。
その後の追加レビュー・検証結果は [MAGIC-REVIEW.md](MAGIC-REVIEW.md) を参照。この文書の状態・未完了項目は記録時点のもの。
この文書は、ユーザーの引き継ぎ内容と、その後 Codex が確認・試行した内容を区別して記録する。
ユーザーから「ここまでを記録整理」と指示されたため、追加の画面検証を止めて記録した。

> **2026-11-07 追記: この文書の未完了項目はすべて完了した。** 以下の「現在の結論」以降は記録時点のまま残す。
>
> - 未コミットだった魔法拡張とリソース保存修正は PR #1 でマージし、v0.13.0 として公開した。
> - 「再開時の順序」1〜10 の結果:
>
> | 項目 | 結果 | 記録 |
> |---|---|---|
> | 残留データの整理 | ワールドをバックアップしたうえで、Actor 25・Item 35・チャット 126・SMOKE Scene を削除した。その後の各検証の後も空であることを確認した | — |
> | 日本語の総当たり | 30/30、問題 0 | [../2026-11-07/sweep-ja/](../2026-11-07/sweep-ja/README.md) |
> | 英語の総当たり | 30/30、問題 0。ライフスタイル欄の切れを見つけ、v0.13.3 で修正した | [../2026-11-07/sweep-en/](../2026-11-07/sweep-en/README.md) |
> | プレイヤー視点・戦闘進行 | 10/10、6 回連続で成功 | [../2026-11-07/player-combat/](../2026-11-07/player-combat/README.md) |
> | 機能別スクリプト 9 本 | 全完了。前提データは `current/fixtures.mjs` で作成 | [../2026-11-07/feature-batch/](../2026-11-07/feature-batch/README.md) |
> | サンプルアクター | v0.13.2 で全 24 手順が成功 | [sample-actors/](sample-actors/README.md) |
>
> - 以前のタイムアウトや失敗は、どれも検証スクリプト側の問題だった。原因はブラウザーのコンテキスト共有、トークンの順序、クリック後の待ち方。system の不具合ではない。
> - スクリプトの実行方法と共通ヘルパーは [../README.md](../README.md) を参照。
>   この文書の「保存したファイル」節に書いた機械固有のパスは、`current/` では `lib.mjs` へ置き換え済み。
>   旧入口の `current/sinless-verify.mjs` は削除した。その出力(`current/*.log` など)は残している。

## 現在の結論

- コミット済みの基準は main の eb3a2a1、v0.12.0。
- 「9 番・魔法の続き」は未コミット。バージョンは package.json / system.json とも 0.12.0 のまま。
- 現在の作業ツリーで npm run check は成功。124 テスト成功、翻訳整合性成功、64 ファイルの構文チェック成功。
- git diff --check も成功。
- リソースのクラス選択に実際の保存不具合が見つかった。現行ソースには修正があり、Foundry で A〜E の option.value を確認できた。
- 修正後の全シート検証、英語検証、プレイヤー検証、戦闘進行の検証は完了していない。画面テスト全体の「問題ゼロ」は確定できない。
- 今回の機能テスト再実行も未完了。旧ログの成功・失敗と、新しい試行の結果を混ぜない。
- 今回の検証用 Node プロセスは終了を確認した。残留するテスト用ドキュメントの一括確認・後片付けは未完了。

## プロジェクトの前提

Foundry VTT 用の非公式 Sinless システム。ES Modules、Handlebars、CSS で構成され、
Foundry がソースを直接読み込む。開発時のバンドルは不要で、npm の外部依存もない。
配布ビルドは dist/sinless.zip と dist/system.json を作る。

- マニフェストの対応設定: 最低 Foundry 13、検証済み 14。
- 実際の今回の画面検証: Foundry 14.365、ワールド sinless-test、http://localhost:30000。
- Actor 種別: character / npc / brand / vehicle。
- シート検証では NPC を通常 NPC / ネットワーク実体 / 精霊に分けて扱うため、アクターの検証パターンは 6 個。
- Item 種別: weapon / armor / gear / implant / power / ritual / knowledge / asset / resource / deck / software / vcr。
- ルール計算は module/helpers/、行動・保存処理の中心は module/documents/actor.mjs。
- 判定は actor → ダイアログ → planTest → performTest → ChatMessage の flags.sinless → カードの後続操作、の流れ。

インストール用マニフェスト:
https://github.com/kenken-trpg/sinless/releases/latest/download/system.json

これは配布済みリリース用で、ローカルの未コミット変更を含むことを保証しない。

## Git の状態

記録用文書・証拠ファイルを追加する直前の状態:

- ブランチ: main。ローカルの追跡情報では origin/main と先行・遅延表示なし。今回 fetch はしていない。
- HEAD: eb3a2a1 / 2026-11-06 20:16:35 +0900。
- コミット名: v0.12.0: operations, lifestyle, car chases and digital combat。
- 追跡済み変更: 25 ファイル、469 行追加・29 行削除。
- 新規未追跡: module/apps/spell-effects.mjs、test/magic2.test.mjs。
- この件について commit / push / リリース / ビルドは行っていない。
- 詳細は evidence/git-status-before-record.txt、evidence/working-tree.patch に保存。
- パッチは追跡済みファイルの差分。上記新規 2 ファイルは evidence/untracked-source/ に別途保存。

### 未コミットの魔法拡張

- 持続呪文: 対象への適用、Active Effect、抵抗成功の蓄積、解除、手番開始時の通知。
- レイライン / ボイドライン: アクターごとの位置・フォース、魔法判定・抵抗の修正。
- 結界: 通過時の成功数減少、結界粉砕。
- 精霊: NPC とのリンク、召喚カードからトークン配置、物理攻撃への防御補正。
- 関連するデータモデル、判定、シート、テンプレート、日英翻訳、README の変更。

## 元の総当たりテストで確認できたこと

ユーザーが作成した sweep.mjs は、各シートの全タブを表示し、編集可能な入力欄を書き換え、
保存値・画面の未翻訳キー等・コンソールエラーを確認する。

元の日本語ログを最後まで読んだところ、30 シート分の個別結果があった。

- アクター 6 パターンは個別に ok。
- 埋め込みアイテム 12 種類とワールド直下アイテム 12 種類のうち、
  resource を除いた 22 シートは個別に ok。
- resource は埋め込み・ワールド直下の両方で失敗。各 17 欄が保存できなかった。
- 最後の再表示でスクリプト自体が例外終了しており、正常終了・自動削除・total 行の出力は確認できない。
- 条件によって非表示になる入力等には skipped があり、「存在し得る全条件分岐の全項目」を網羅した証拠にはならない。

元ログは original/sweep-ja.log、元スクリプトは original/sweep.mjs。

## 見つかった問題と現在の状態

### 1. リソースのクラス欄で全体の保存が失敗する

場所: module/data/brand.mjs の ResourceData.defineSchema().class。

変更前:

~~~js
choices: () => Object.keys(RESOURCE_CLASSES)
~~~

Foundry 14.365 のフォームでは、配列のインデックスが選択肢の値になり、
本来 A〜E を送る欄が 0〜4 を送っていた。

ログの例:

~~~text
class: 0 is not a valid choice
class: 4 is not a valid choice
~~~

シートがフォーム全体を送るため、名前や他の数値欄の編集もこの検証エラーに巻き込まれた。

現行の変更:

~~~js
choices: () => Object.fromEntries(Object.keys(RESOURCE_CLASSES).map(k => [k, k]))
~~~

この修正は確認中に別途ワークスペースへ入ったもので、Codex が書き換えたものではない。
Codex の修正コマンドは前提の文字列が既に変わっていたため assert で停止し、ソースを変更しなかった。
既存の修正を維持して検証した。並行作業の有無を質問したが、記録時点まで回答は得ていない。

修正後、実際の Foundry で次を確認:

- value / label が A, B, C, D, E。
- 初期選択値 D。
- この診断中のコンソール記録は空。

証拠: current/diagnose-ja.log。
ただし、修正後の resource 全 17 欄の保存再検証は未完了。

### 2. 元の sweep.mjs が名前変更後に対象を見失う

元スクリプトは name 欄も変更する一方、最後に getName("SWEEP Char") で再検索していた。
そのため最後のスクリーンショットで undefined.sheet になり、後片付けまで到達できなかった。

Codex は一時スクリプトに以下を追加:

- 作成直後の UUID / ID を保持し、名前に依存せず対象を追跡。
- finally で保持 ID を使って削除を試みる。
- 日本語と英語のテストデータを別の名前にする。
- 20 欄ごとの進捗表示と、正常終了時の JSON 結果出力。

ただし、この改修版も最後まで完走していない。
強制停止時の削除は保証できず、正常終了時の report-ja.json / report-en.json は生成されなかった。
「後片付けまで検証済み」と扱わない。

### 3. 古い射撃・成長スクリプトの問題

- shoot.mjs: page.evaluate から rollSkill() の Promise をそのまま返しており、
  次の Playwright ステップが操作するダイアログを待ち続ける箇所がある。
  一時コピーで呼び出しを開始するだけに変更。
- adv.mjs: const ben = fn => page.evaluate(fn) で、最後の復元処理に渡した第 2 引数が消えていた。
  一時コピーで (fn, arg) => page.evaluate(fn, arg) に変更。
- 今回の射撃再実行は最初の射撃まで進んだが、2 回目の dualWield チェックボックス操作が 8 秒でタイムアウト。
  製品側の不具合か、テスト操作・接続・負荷の問題かは未切り分け。
- 後続の batch.mjs には待ち時間延長と失敗時画面保存を用意したが、実行していない。
- 成長スクリプトの改修版も再実行未完了。

## Codex が今回実行した検証結果

| 対象 | 結果 | 証拠・限界 |
|---|---|---|
| npm run check | 成功 | 124 tests / 124 pass / 0 fail / 0 skip。i18n OK、syntax OK (64 files)。結果は会話内の実行出力で確認 |
| git diff --check | 成功 | 記録前にも確認。端末出力にエラーなし |
| resource の選択肢 | 成功 | current/diagnose-ja.log。A〜E と D 初期値、コンソール空 |
| 日本語総当たり再実行 | 一部成功、全体未完了 | キャラクター 130/130、NPC 107/107、ネットワーク実体 106/106 は ok |
| 英語総当たり | 未完了 | lang en とキャラクター 20/40/60 欄目の進捗のみ。シート単位の ok はない |
| 射撃の再実行 | 未完了 | 最初の射撃の結果あり。2 回目のチェック操作でタイムアウト |
| プレイヤー・戦闘用テスト | 未完了 | 一時ユーザー等を作成したが、プレイヤーログイン後の game.ready 待ちが 90 秒でタイムアウト |
| 戦闘トラッカー | 今回未到達 | イニシアチブ、回復、通知等の新しい PASS 記録なし |
| 機能テスト 9 本の batch | 未実行 | スクリプト準備のみ。regression.json はない |

current/player-combat.json の内容は []。
これは「失敗ゼロ」の意味ではなく、PASS を 1 件も記録する前に中断したという意味。

同じ GM の複数ブラウザーでの並行検証も行っていた。
ログ更新が止まり、原因未切り分けのため、自分が起動した総当たり用の 2 プロセスを停止した。
プレイヤー用プロセスはその前後にタイムアウト終了した。

総当たりログ末尾の次の例外は、停止に伴うもので、シートの製品不具合件数に数えない:

~~~text
page.evaluate: Target page, context or browser has been closed
~~~

同時に、停止した実行を全体成功としても扱わない。

## テスト用ワールドの後片付け

停止後にライブのワールドを再確認していないため、残留物は未確定。

元スクリプトは名前自体を書き換えるので、SWEEP という接頭辞だけの削除では取り残しがある。
今回の再実行も途中終了のため、名前だけで一括削除せず、作成時刻・ID・内容で対象を照合する。

初回診断で確認できた、元テスト由来と見られるアクター:

| ID | 診断時の名前 |
|---|---|
| 7h9zTGZPAyjz0XNA | SW40 |
| nJ7bklLCCujzmPZ7 | SW44 |
| eW6Ux6dJIEQCDS41 | SW54 |
| 4dHbVg0H2Wztjzzh | SW74 |
| uP0ZaYsnWUX2KBeV | SW74 |
| bp8zMkToJey7erPA | SW99 |

これらの削除用 mode は用意したが実行していない。
上記以外に今回の日本語・英語再実行で作ったアクターとワールド Item が残っている可能性がある。

プレイヤーテストで作成した対象:

- User: lo5jRQhtYd7pIZ82 / VERIFY Player 1793967529994
- PC: 9MWH8s301TWb2wgj / VERIFY Player Character
- NPC: eWm5zVpxdXjXSThh / VERIFY GM Enemy
- Scene: saDSgz2GgCTaMHqj / VERIFY Scene
- 元のアクティブ Scene: 4U11wXuc06VhTwUK / SMOKE Scene

プレイヤーテストの finally は、元 Scene への復帰、一時 Scene・Actor・User の削除、
その後の空 JSON 保存まで進んだ。ただし、ワールドの最終一覧で削除を再確認したわけではない。
これらの ID は残留確認の手掛かりとして残す。

## 保存したファイル

この文書と同じディレクトリ内:

- original/: 元の作業ディレクトリの .mjs と .log。以前の成功ログと途中終了ログを含む。
- current/: 今回作成した検証スクリプト、ログ、スクリーンショット、空の player-combat.json。
- current/sinless-verify.mjs: 今回の実行入口(2026-11-07 に削除。`npm run verify` に置き換えた。出力したログは残している)。
- current/batch.mjs: 未実行の機能テスト一括ランナー。
- current/extra.mjs: 未完了のプレイヤー・戦闘テスト。
- evidence/: Git の状態、差分、未追跡ソースのスナップショット、検証状況の機械可読記録。

コピーしたスクリプトには元の絶対パスが含まれる。
アーカイブから再実行するときは、import 元、出力先、Playwright の場所を直す必要がある。
そのまま大量実行するための完成済みテストスイートではない。

元の作業ディレクトリ:

~~~text
/private/tmp/claude-501/-Users-mantanikenichi-mydevelop/169d1560-1874-49ac-a866-603a5aec9198/scratchpad/pw
~~~

今回の作業ディレクトリ:

~~~text
/private/tmp/sinless-verify.mjs
/private/tmp/sinless-verification/
~~~

元の一時ファイルも変更・削除せず残している。
一時ディレクトリが消えても再調査できるよう、今回の記録に必要なスクリプトとログはこの場所へコピーした。

## 再開時の順序

1. 同じワークスペースや Foundry に対する別作業の有無を確認する。既存の未コミット変更を保全する。
2. テスト用ワールドの残留 Actor / Item / User / Scene と、アクティブ Scene を確認して整理する。
3. まず 1 ブラウザー・1 言語・1 シートの resource で、全欄の保存を確認する。
4. 途中の評価・保存・シート終了にも制限時間と進捗・失敗時画面を持たせ、最小構成で停止原因を切り分ける。
5. 日本語総当たりを最後まで実行し、結果 JSON、total、作成物の削除を確認する。
6. 日本語が終わってから英語を実行する。条件付きの非表示欄や skipped の扱いも記録する。
7. プレイヤーの game.ready タイムアウトを解消し、自分のシート、GM NPC への攻撃、権限警告を確認する。
8. 戦闘のイニシアチブ、手番とラウンドの違い、プール回復、過負荷・持続呪文通知を確認する。
9. 射撃・状態・成長・オペレーション・生活費・チェイス・デジタル戦闘・魔法の既存テストを順番に実行する。
10. その時点の差分に npm run check と必要な実機確認を行い、魔法拡張と resource 修正をレビュー可能な状態にまとめる。

コミット・公開はまだ実施していない。
