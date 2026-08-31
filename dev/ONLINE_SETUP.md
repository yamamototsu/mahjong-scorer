# オンライン共有（友達機能）を有効にする手順

「友達」機能（友達コードで追加 → 選んだ対局結果を送り合う）は、
Firebase（Googleのサービス・この用途なら無料枠で十分）をサーバとして使う。
**下の設定を貼るまで、アプリには友達機能のボタンごと表示されない。**

## 1. Firebaseプロジェクトを作る（1回だけ・10分）

1. https://console.firebase.google.com/ をGoogleアカウントで開き「プロジェクトを追加」
   - 名前は自由（例: mahjong-scorer）。Googleアナリティクスは**不要（オフ）**
2. 左メニュー「構築 → Authentication」→「始める」→ ログイン方法で **「匿名」を有効化**
3. 左メニュー「構築 → Realtime Database」→「データベースを作成」
   - ロケーション: **asia-southeast1（シンガポール）** が日本から近い
   - **ロックモードで開始**を選ぶ
4. Realtime Database の「ルール」タブに、下の **セキュリティルール** を丸ごと貼って「公開」
5. ⚙️「プロジェクトの設定」→ 下の「マイアプリ」→ **ウェブ（</>）を追加**
   - ニックネームは自由。「Firebase Hosting」は**チェック不要**
   - 表示される `firebaseConfig = { ... }` をコピー

## 2. アプリに設定を貼る

`dev/mahjong-scorer.jsx` の先頭付近にある

```js
const FIREBASE_CONFIG = null;
```

を、コピーした値で置き換える（`databaseURL` が含まれていることを確認。
無ければ Realtime Database 画面上部のURLを `databaseURL: "..."` として足す）:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "xxxx.firebaseapp.com",
  databaseURL: "https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xxxx",
  appId: "1:1234:web:abcd",
};
```

ビルドしてデプロイすれば、タイトル画面に「👥 友達」が現れる。
（この設定値は公開されても前提どおり。守りはセキュリティルールが担う）

## 3. セキュリティルール（ルールタブに貼るJSON）

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.hasChildren(['name', 'code'])",
        "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20" },
        "code": { ".validate": "newData.isString() && newData.val().length === 6" },
        "createdAt": { ".validate": "newData.isNumber()" },
        "$other": { ".validate": false }
      }
    },
    "codes": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && !data.exists() && newData.val() === auth.uid"
      }
    },
    "friends": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$fid": {
          ".write": "auth != null && (auth.uid === $uid || auth.uid === $fid)",
          ".validate": "newData.hasChildren(['name', 'addedAt'])",
          "name": { ".validate": "newData.isString() && newData.val().length <= 20" },
          "addedAt": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        }
      }
    },
    "inbox": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$item": {
          ".write": "auth != null && ((newData.exists() && newData.child('from').val() === auth.uid) || (!newData.exists() && auth.uid === $uid))",
          ".validate": "newData.hasChildren(['from', 'fromName', 'sentAt', 'game'])"
        }
      }
    }
  }
}
```

ルールの意味:
- 自分のプロフィール・友達リスト・受信箱は本人しか書けない／受信箱と友達リストは本人しか読めない
- 友達コード（codes）は「空きコードを自分のuidで1回だけ確保」しかできない
- 他人の受信箱には「差出人＝自分」の対局しか入れられない。削除は受け取った本人のみ
- ルート直下はすべて拒否（部屋の一覧取得のようなことはできない）

## 4. 動作確認（スマホ2台で）

1. 両方のスマホでアプリを開き「👥 友達」→ それぞれ名前を登録
2. 片方の6文字コードを、もう片方が入力して「追加」→ お互いのリストに載る
3. 履歴 →「📤 対局を選んで友達に送る」→ 対局を選ぶ → 送り先を選んで送信
4. 受け取る側は「👥 友達」を開く（開いた時に受信箱を自動確認）→「取り込む」
   → 履歴と通算成績に反映される。同じ対局を二重に受け取っても重複しない

## 5. 運用メモ

- **費用**: Sparkプラン（無料・カード登録不要）。この使い方なら無料枠の1%も使わない。
  超過課金は構造的に発生しない（枠を超えるとその月は止まるだけ）
- **データの中身**: 送信した対局結果（4人の名前と点数）と表示名がGoogleのサーバを経由する。
  受信箱は取り込んだ時点で削除される
- **IDについて**: 端末（ブラウザ）ごとの匿名ID。ブラウザのサイトデータを消すとIDが変わり、
  友達関係は再追加が必要（アプリ内の説明にも記載済み）。ネイティブアプリ化後は実質安定する
- **荒らし対策が必要になったら**: Firebaseコンソールから App Check（reCAPTCHA）を後付けできる
