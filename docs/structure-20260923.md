# ファイル構成の整理と検証（2026-09-23）

ルートに集中していたファイルを用途別に移動した。アプリの入口は引き続き `index.html` とし、ビルド不要・ファイルのダブルクリック・静的サイト配信を維持する。

| 移動前 | 移動後 |
| --- | --- |
| `app*.js`、`seed-data.js`、`stage-presets.js` | `src/` |
| `styles.css`、`ogp.png`、`icons/` | `assets/` |
| `character-data.generated.js` | `data/character-data.generated.js` |
| `tools/*-browser-check.mjs` | `test/browser/` |

HTML・manifest・生成ツール・テスト・READMEの参照先を更新した。キャラデータ更新用の `.bat` は従来の場所で使える。公開用生成ファイルのキャッシュキー更新と再生成の冪等性も維持する。

アプリ本体・生成データ・CSS・画像の移動対象18ファイルは移動前後のSHA-256が一致した。保存キー、IndexedDB名、データ形式、標準固定プロンプト、キャラJSONは変更していない。既存の個人バックアップ・出力結果・作業ファイルは保持し、`output/` と `tmp/` をGitの除外対象に追加した。

旧形式の復元テストがGit管理外の個人バックアップに依存していたため、`test/fixtures/legacy-backup-v1.json` に架空のキャラを使った最小データを追加した。小説欄のないversion 1の復元で既存小説を維持すること、お気に入りの由来を推測しないこと、再読み込み後も保持することを引き続き検証する。

## 検証結果

環境：Windows、Node.js 24.18.0、Chrome 153.0.8010.53。一時プロファイルを使用し、利用者のブラウザーの保存データにはアクセスしていない。

| 確認 | 結果 |
| --- | --- |
| 変更前の `node --test test/*.test.js` | 64件成功 |
| 変更後の同コマンド | 67件成功。HTML・manifest・CSS・READMEの参照パス検査3件を追加 |
| 個人バックアップ・未公開資料・作業ファイルのない配布対象のみのコピー | 同じ67件が成功 |
| `node --check` | アプリ・生成データ・ツール・テスト30ファイル成功 |
| `test/browser/core-browser-check.mjs` | キャラCRUD、JSON入出力、絞込み、固定、条件保存、削除状態の保持、375/390/1280px幅が成功 |
| `test/browser/library-browser-check.mjs` | 本文・版履歴・TXT/JSON出力・完全バックアップ復元・お気に入り処理が成功 |
| `test/browser/context-browser-check.mjs` | 14舞台・補足設定・夢主設定・再利用・保存失敗時の保全・復元・テーマが成功 |
| `test/browser/recipe-card-browser-check.mjs` | カルテ・条件編集・適用範囲・記録保持・復元・容量不足時の保全が成功 |
| HTTP配信の `/` と `/dream-gacha/` | 各19参照がHTTP 200。CSS適用・390px表示・ページエラーと読込失敗なしを確認 |
| 旧構成から新構成への同一URLでの切替 | 独自固定文・追加指定・お気に入り・テーマ・生成記録・小説を含むlocalStorageとIndexedDBの内容が一致 |
| `git diff --check` | 成功 |

ローカルに既存の未追跡 `prototype/` があるため、参照しているドメイン処理のパス2箇所も修正し、その関連テスト25件が成功した。未追跡の設計資料は現行ソースへのリンクだけを更新し、過去の実験記録は保持した。

この記録はローカル検証についてのもの。GitHubへのpush、GitHub Pagesの本番デプロイ、スマートフォン実機でのホーム画面追加は実施していない。実行コマンドは [READMEのテスト手順](../README.md#テスト) を参照。
