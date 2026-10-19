[English](README.md) | [한국어](README.ko.md) | **日本語**

# Cockpit

プロンプトの上にコックピットを表示する Claude Code の mod です。モデルと effort、使用量の上限、天気予報風のコンテキストウィンドウの状態、現在のプランの進捗を表示します。実行前に確認を挟む Resume、Rewind、Compact、Clear ボタンと、コマンドを入力せずにモデルと effort を切り替えられるピッカーも備えています。

<!-- IMAGE 1: バンド全体（3 行、枠線あり）が見える画面。ファイル名: screenshots/cockpit-overview.png -->
![プロンプト上の Cockpit: モデルと effort、使用量の上限、コンテキスト予報、プランの進捗、ボタン](screenshots/cockpit-overview.png)

## 機能

```text
╭──────────────────────────────────────────────────────────────────────────╮
│ Sonnet 5.5 · high │ 5h 31% ↻ 20:40 (1h 25m) │ Weekly 37% ↻ 10/23 01:00   │
│ ☁ Cloudy 124k/1M ▓░░░░░░░░░ (+12k) │ Plan 3/7 ▓▓▓░░░░ ▶ Writing tests   │
│ Model: sonnet ▾  Effort: high ▾          Resume  Rewind  Compact  Clear  │
╰──────────────────────────────────────────────────────────────────────────╯
```

| 行 | 表示内容 |
| --- | --- |
| 1 | セッションのモデルと effort、続いて使用量の上限 2 つ（5 時間、週間）と、それぞれのリセット時刻 |
| 2 | コンテキストウィンドウの予報と、現在のプランの進捗 |
| 3 | 左にモデル・effort のピッカー、右に Resume / Rewind / Compact / Clear ボタン |

**モデルと effort。** モデル名はセッションから読み取ります。たとえば `claude-sonnet-5-5` は `Sonnet 5.5` と表示されます。effort の前の `⚠` は、直近のリクエストが選択した effort とは異なる値で送られたことを示します。

**使用量の上限。** 各上限は使用率を表示し、70% 未満は緑、70% 以上は黄、90% 以上は赤で表示します。リセット時刻は 24 時間以内なら `HH:MM (残り時間)`、それ以降は `M/D HH:MM` の形式で、ローカル時間です。Claude Code がアカウントの上限を返さない場合、上限の欄は非表示になります。

**コンテキスト予報。** ウィンドウに対する割合ではなく、コンテキストに溜まったトークン数で決まります。

| コンテキストのトークン数 | 予報 |
| --- | --- |
| 100k 未満 | ☀ Sunny |
| 100k – 199k | ☁ Cloudy |
| 200k – 399k | ☂ Rain（黄） |
| 400k 以上 | ⛈ Storm（赤） |

横には、ウィンドウに対する使用トークン、10 マスのバー、直近のターンで増えた量（例: `(+12k)`）が表示されます。

**プランの進捗。** Claude が todo・task ツールで管理しているプランを読み取り、`Plan 完了/全体`、7 マスのバー、`▶` に続けて進行中のステップを表示します。すべて完了すると `✔ All done` と表示されます。プランがない場合、この部分は非表示です。

**ボタン。** Resume、Rewind、Compact、Clear は、最初に押しただけでは実行されません。下の行が `⚠ This clears the whole conversation. Run it?` のような質問に変わり、Yes と No のボタンが表示されます。No にフォーカスがあるため、Enter を押すとキャンセルされます。質問は 10 秒経過、Esc を押す、または新しいターンが始まると自動的に閉じます。Claude が作業中のときはボタンが薄く表示され、押すと短い通知だけが出ます。

**ピッカー。** モデルまたは effort のボタンを押すと選択肢の行が開き、現在の値に `✔` が付きます。

- モデル: `haiku`、`sonnet`、`opus` のうち、お使いの Claude Code が提供するものだけを表示します。コンテキストが 200k トークン以上のときは、先に確認します。モデルを切り替えるとキャッシュが作り直されるためです。
- Effort: `low`、`medium`、`high`、`xhigh`、`max`

**`/cockpit-status`** は、mod が読み取っている値（コンテキスト、上限、モデル、effort の出どころ、プラン、操作ごとに最後に成功した経路）を出力します。表示がおかしいときに使ってください。

バンドは使える領域に合わせて縮みます。行数が足りないと枠線をなくし、次に 1 行目と 2 行目を統合し、最後は 1 行だけ表示します。幅が足りないと、ステップ名、プランのバー、コンテキストのバー、直近のターンの増減、リセット時刻の順に詳細を省きます。

<!-- IMAGE 2: モデルまたは Effort のボタンを押して選択肢の行が開いた画面。ファイル名: screenshots/cockpit-picker.png -->
![現在の値に印が付いた effort ピッカー](screenshots/cockpit-picker.png)

<!-- IMAGE 3: Compact または Clear のボタンを押して確認の質問（Yes / No）が表示された画面。ファイル名: screenshots/cockpit-confirm.png -->
![Clear は実行前に確認を求めます](screenshots/cockpit-confirm.png)

## 仕組み

この mod は、hooks モジュール 1 つ（`hooks/register.tsx`）と純粋関数の集まり（`hooks/lib.ts`）で構成されています。モデルの呼び出しも、ネットワークへの送信も行いません。

| Hook | 役割 |
| --- | --- |
| `session.start` | 最初の値を読み取り、保存済みの effort の選択を復元し、リセットのカウントダウン用に 1 分タイマーを始め、`/cockpit-status` を登録します。 |
| `session.measure` | Claude Code がコンテキストと使用量の上限を測定するたびに値を更新します。 |
| `turn.start` | 開いている質問とピッカーを閉じます。サブエージェントのターンは対象外です。 |
| `turn.step` | リクエストが実際に載せる effort を記録し、他の経路が使えないときは選択した effort で上書きします。 |
| `turn.complete` | メインループのターンが終わるたびに、使用量、プラン、モデルを更新します。 |
| `command.run`（`/cockpit-status`） | 診断用のテキストで応答します。 |
| `command.run`（`/effort`） | 手で入力した effort を新しい選択として扱います。 |
| `classic.SessionStart` | `/clear`、`/resume`、fork のあとに値を読み直します。 |
| `session.end` | clear と resume のとき、待機中の質問と使用量の値を消します。 |
| `ui.focus`（`{component: "AbovePrompt"}`） | フォーカスがバンドから外れたら、質問とピッカーを閉じます。 |
| `ui.render`（`{component: "AbovePrompt"}`） | バンドを描画します。 |

各ボタンは、処理する方法を複数持ち、最初に成功した方法を使います。Claude Code が変わってもボタンが動かなくならないようにするためです。

- **Compact:** セッションの compact 呼び出し → `/compact` コマンド → プロンプトに `/compact` を入力しておく（Enter で自分で実行）
- **Clear、Resume、Rewind:** 対応するコマンド → プロンプトにコマンドを入力しておく
- **Effort:** effort の設定 → `/effort` コマンド → 次のリクエストでの上書き

すべての方法が失敗した場合は、自分で入力するコマンドを通知します。

## 使い方

**動作要件**

- Claude Code 2.1.303 以降。`claude plugin validate` と `claude plugin test` は 2.1.303 で通ります。それより古いバージョンは確認していません。
- ターミナル環境。バンドはターミナル画面のプロンプトの上に描画されます。

環境変数や設定は不要です。

**このリポジトリからインストール**

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Claude Code のセッション内では次のように入力します。

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

バンドを表示するには、Claude Code を再起動するか、`/reload-plugins` を実行してください。

**インストールせずに 1 セッションだけ試す**

```bash
git clone https://github.com/Hugo-Jang/claude-cockpit-mods.git
cd claude-cockpit-mods
claude --plugin-dir ./cockpit
```

**開発とテスト**

```bash
claude plugin validate ./cockpit
claude plugin test ./cockpit
```

## 注意事項 / 制限

- **予報は割合ではなくトークン数で決まります。** 1M トークンのウィンドウでも、`☁ Cloudy` は 100k トークンから始まり、これはウィンドウの 10% にすぎません。横のバーがウィンドウに対する割合を示します。
- **使用量の上限はアカウントによって異なります。** Claude Code が返さない場合は、推測せずその欄を非表示にします。
- **プランは Claude の todo・task ツールから取得します。** Claude が文章でしか説明していない計画は表示されません。
- **ボタンは Claude の作業が終わるのを待ちます。** 作業中はボタンが薄くなり、押しても通知だけが出ます。
- **上書き経路で選んだ effort は、次のリクエストから適用されます。** mod はこの値をセッションをまたいで保持します。他の 2 つの経路は即時に適用されます。
- **モデルを切り替えるとプロンプトキャッシュが作り直される**ため、次のターンでトークンが多く使われることがあります。そのため、コンテキストが大きいときは先に確認します。
- **1 セッションにつきバンドは 1 つです。** プロンプトの上に描画する他のプラグインとは同じ場所を取り合います。Claude Code のアンケートが表示されている間は、バンドは譲ります。
- **バンド内の文言は英語のみです。**

## 依存関係

| 名前 | バージョン | ライセンス (SPDX) | 入手元 |
| --- | --- | --- | --- |
| なし | | | |

## サードパーティ通知

なし。

## 作者

[Hugo-Jang](https://github.com/Hugo-Jang)

## ライセンス

[MIT](../LICENSE)

---

現状のまま共有しています。Anthropic の公式製品ではなく、サポートやメンテナンスは保証されません。
