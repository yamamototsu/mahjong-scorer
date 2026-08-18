import base64, json, os, subprocess, sys

TOKEN = os.environ["GH_TOKEN"]
REPO = "widespreder/mahjong-scorer"
MSG = sys.argv[1] if len(sys.argv) > 1 else "update"

# (リポジトリ上のパス, ローカルのパス)
FILES = [
    ("index.html", "/mnt/user-data/outputs/index.html"),
    ("dev/mahjong-scorer.jsx", "/mnt/user-data/outputs/mahjong-scorer.jsx"),
]


def api(method, url, payload=None):
    cmd = ["curl", "-s", "-X", method,
           "-H", f"Authorization: Bearer {TOKEN}",
           "-H", "Accept: application/vnd.github+json",
           url]
    if payload is not None:
        with open("/home/claude/_payload.json", "w") as f:
            json.dump(payload, f)
        cmd += ["-H", "Content-Type: application/json", "-d", "@/home/claude/_payload.json"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out)


ok = True
for path, local in FILES:
    if not os.path.exists(local):
        print(f"  skip {path}（ローカルにありません）")
        continue
    base = f"https://api.github.com/repos/{REPO}/contents/{path}"
    sha = api("GET", base).get("sha")   # 毎回取り直す（409対策）
    content = base64.b64encode(open(local, "rb").read()).decode()
    payload = {"message": MSG, "content": content}
    if sha:
        payload["sha"] = sha
    res = api("PUT", base, payload)
    if "content" in res:
        print(f"  OK {path}  {res['commit']['sha'][:7]}  {res['content']['size']:,} bytes")
    else:
        ok = False
        print(f"  ERROR {path}: {res.get('message')}")

print("完了" if ok else "一部失敗しました")
