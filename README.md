# Mindra Light Browser

カスタム Electron ベースの軽量ブラウザ。

## 機能

-   Brave の広告ブロックエンジン（adblock-rs）
-   YouTube 専用広告除去パッチ（JavaScript）
-   ニコニコ / Yahoo 向け DOM/CSS 広告除去
-   プロファイル切り替え（partition: persist:profile-x）
-   タブ・URLバー・検索（Ctrl+F）
-   ショートカット多数
-   GitHub Actions で Windows / macOS / Linux を自動ビルド

------------------------------------------------------------------------

## インストール

    npm install

------------------------------------------------------------------------

## ローカルでの実行方法

    npm start

------------------------------------------------------------------------

## ローカルビルド方法（パッケージ作成）

    npm run build

`dist/` フォルダに各 OS 向けのパッケージが生成されます。

------------------------------------------------------------------------

## フォルダ構成

    MindraLight/
     ├─ main.js
     ├─ preload.js
     ├─ index.html
     ├─ package.json
     ├─ filters/
     │   ├─ easylist.txt        ← GitHub には含めない（.gitignore）
     │   ├─ easyprivacy.txt     ← GitHub には含めない（.gitignore）
     │   └─ custom-*.txt        ← 自作フィルタは自由
     ├─ .github/workflows/build.yml
     ├─ .gitignore
     └─ README.md

------------------------------------------------------------------------

## EasyList / EasyPrivacy について

ライセンスが GPL のため、\
**GitHub へ同梱することは禁止**です。

以下からダウンロードして `filters/` に置いてください：

-   https://easylist.to/easylist/easylist.txt\
-   https://easylist.to/easylist/easyprivacy.txt

------------------------------------------------------------------------

## GitHub Actions 自動ビルド

`.github/workflows/build.yml` により次が自動生成されます：

-   Windows（.exe）
-   macOS（.app / .dmg）
-   Linux（AppImage / deb）

成果物は Artifact として保存されます。

------------------------------------------------------------------------

## ライセンス

-   本体：MIT\
-   EasyList/EasyPrivacy：GPL（※同梱禁止）
