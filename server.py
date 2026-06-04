from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
import json
import os
import secrets
import socket
import time
import uuid


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "db.json"
PORT = int(os.environ.get("PORT", "4173"))


def now_ms():
    return int(time.time() * 1000)


def seed_data():
    current = now_ms()
    return {
        "users": [],
        "sessions": {},
        "posts": [
            {
                "id": 1,
                "topic": "mbti",
                "title": "ENFP 和 INTJ 真的容易互相吸引吗？",
                "body": "最近发现身边很多朋友都在讨论 MBTI。想听听大家真实经历，哪些组合相处起来最有火花？",
                "author": "晚风岛民",
                "authorId": "seed-1",
                "tags": ["ENFP", "本科", "上海"],
                "likes": 128,
                "comments": 2,
                "createdAt": current - 12 * 60 * 1000,
                "replies": [
                    {"id": 11, "author": "岛民", "body": "INTJ 路过，确实会被很有生命力的人吸引。", "createdAt": current - 8 * 60 * 1000},
                    {"id": 12, "author": "青柠", "body": "别太迷信类型，但它很适合用来打开话题。", "createdAt": current - 6 * 60 * 1000},
                ],
            },
            {
                "id": 2,
                "topic": "work",
                "title": "刚工作半年，每天下班后只想躺着正常吗？",
                "body": "从学校到职场以后，最大的感受是精力被抽干。大家是怎么恢复状态的？",
                "author": "周一逃生",
                "authorId": "seed-2",
                "tags": ["INFP", "硕士", "互联网"],
                "likes": 96,
                "comments": 2,
                "createdAt": current - 34 * 60 * 1000,
                "replies": [
                    {"id": 21, "author": "橘子", "body": "正常，先保证睡眠和边界感。", "createdAt": current - 20 * 60 * 1000},
                    {"id": 22, "author": "海盐", "body": "不要把恢复也变成任务，慢慢来。", "createdAt": current - 15 * 60 * 1000},
                ],
            },
        ],
        "reports": [
            {"id": 101, "postId": 1, "title": "示例举报：疑似人身攻击回复", "reason": "用户举报：含攻击性表达", "status": "待处理", "createdAt": current - 60 * 60 * 1000}
        ],
    }


def ensure_db():
    DATA_DIR.mkdir(exist_ok=True)
    if not DB_PATH.exists():
        write_db(seed_data())


def read_db():
    ensure_db()
    with DB_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_db(db):
    DATA_DIR.mkdir(exist_ok=True)
    with DB_PATH.open("w", encoding="utf-8") as file:
        json.dump(db, file, ensure_ascii=False, indent=2)


def clean_text(value, limit):
    return str(value or "").strip()[:limit]


def relative_time(created_at):
    diff = max(0, now_ms() - int(created_at or 0))
    minutes = diff // 60000
    if minutes < 1:
        return "刚刚"
    if minutes < 60:
        return f"{minutes} 分钟前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} 小时前"
    return f"{hours // 24} 天前"


def public_user(user):
    if not user:
        return None
    return {
        "id": user["id"],
        "name": user.get("name", ""),
        "bio": user.get("bio", ""),
        "mbti": user.get("mbti", ""),
        "education": user.get("education", ""),
        "city": user.get("city", ""),
        "industry": user.get("industry", ""),
        "publicTags": bool(user.get("publicTags")),
    }


def public_post(post):
    item = dict(post)
    item["time"] = relative_time(item.get("createdAt"))
    item["replies"] = [dict(reply, time=relative_time(reply.get("createdAt"))) for reply in item.get("replies", [])]
    return item


def user_tags(user):
    if not user.get("publicTags"):
        return []
    return [tag for tag in [user.get("mbti"), user.get("education"), user.get("city"), user.get("industry")] if tag]


def local_addresses():
    addresses = []
    hostname = socket.gethostname()
    try:
        for info in socket.getaddrinfo(hostname, PORT, socket.AF_INET):
            address = info[4][0]
            if address and not address.startswith("127.") and address not in addresses:
                addresses.append(address)
    except socket.gaierror:
        pass
    return addresses


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def current_user(self, db):
        header = self.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        user_id = db.get("sessions", {}).get(token)
        if not user_id:
            return None
        return next((user for user in db.get("users", []) if user["id"] == user_id), None)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.handle_api()
        if urlparse(self.path).path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        return self.handle_api()

    def do_PUT(self):
        return self.handle_api()

    def do_PATCH(self):
        return self.handle_api()

    def handle_api(self):
        db = read_db()
        path = urlparse(self.path).path
        user = self.current_user(db)

        try:
            if self.command == "GET" and path == "/api/state":
                posts = sorted(db["posts"], key=lambda post: post.get("createdAt", 0), reverse=True)
                reports = sorted(db["reports"], key=lambda report: report.get("createdAt", 0), reverse=True)
                return self.send_json(200, {"user": public_user(user), "posts": [public_post(post) for post in posts], "reports": reports})

            if self.command == "POST" and path == "/api/login":
                body = self.read_body()
                name = clean_text(body.get("name"), 18)
                if not name:
                    return self.send_json(400, {"error": "请填写昵称"})
                user_record = {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "bio": "想找一个可以轻松说话的地方。",
                    "mbti": "",
                    "education": "",
                    "city": "",
                    "industry": "",
                    "publicTags": True,
                    "createdAt": now_ms(),
                }
                token = secrets.token_hex(24)
                db["users"].append(user_record)
                db["sessions"][token] = user_record["id"]
                write_db(db)
                return self.send_json(200, {"token": token, "user": public_user(user_record)})

            if not user:
                return self.send_json(401, {"error": "请先登录"})

            if self.command == "PUT" and path == "/api/profile":
                body = self.read_body()
                user["name"] = clean_text(body.get("name"), 18) or user["name"]
                user["bio"] = clean_text(body.get("bio"), 80)
                user["mbti"] = clean_text(body.get("mbti"), 8).upper()
                user["education"] = clean_text(body.get("education"), 12)
                user["city"] = clean_text(body.get("city"), 16)
                user["industry"] = clean_text(body.get("industry"), 16)
                user["publicTags"] = bool(body.get("publicTags"))
                write_db(db)
                return self.send_json(200, {"user": public_user(user)})

            if self.command == "POST" and path == "/api/posts":
                body = self.read_body()
                title = clean_text(body.get("title"), 40)
                post_body = clean_text(body.get("body"), 500)
                topic = clean_text(body.get("topic"), 16)
                if not title or not post_body:
                    return self.send_json(400, {"error": "标题和正文不能为空"})
                db["posts"].insert(0, {
                    "id": now_ms(),
                    "topic": topic,
                    "title": title,
                    "body": post_body,
                    "author": user["name"],
                    "authorId": user["id"],
                    "tags": user_tags(user) if body.get("showTags") else [],
                    "likes": 0,
                    "comments": 0,
                    "createdAt": now_ms(),
                    "replies": [],
                })
                write_db(db)
                return self.send_json(200, {"ok": True})

            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[:2] == ["api", "posts"] and parts[3] == "like" and self.command == "POST":
                post = next((item for item in db["posts"] if str(item["id"]) == parts[2]), None)
                if not post:
                    return self.send_json(404, {"error": "帖子不存在"})
                post["likes"] = int(post.get("likes", 0)) + 1
                write_db(db)
                return self.send_json(200, {"ok": True})

            if len(parts) == 4 and parts[:2] == ["api", "posts"] and parts[3] == "replies" and self.command == "POST":
                post = next((item for item in db["posts"] if str(item["id"]) == parts[2]), None)
                body = self.read_body()
                reply_body = clean_text(body.get("body"), 220)
                if not post:
                    return self.send_json(404, {"error": "帖子不存在"})
                if not reply_body:
                    return self.send_json(400, {"error": "回复不能为空"})
                post.setdefault("replies", []).insert(0, {"id": now_ms(), "author": user["name"], "body": reply_body, "createdAt": now_ms()})
                post["comments"] = len(post["replies"])
                write_db(db)
                return self.send_json(200, {"ok": True})

            if len(parts) == 4 and parts[:2] == ["api", "posts"] and parts[3] == "report" and self.command == "POST":
                post = next((item for item in db["posts"] if str(item["id"]) == parts[2]), None)
                if not post:
                    return self.send_json(404, {"error": "帖子不存在"})
                db["reports"].insert(0, {"id": now_ms(), "postId": post["id"], "title": post["title"], "reason": f"用户 {user['name']} 举报：需要管理员复核", "status": "待处理", "createdAt": now_ms()})
                write_db(db)
                return self.send_json(200, {"ok": True})

            if len(parts) == 3 and parts[:2] == ["api", "reports"] and self.command == "PATCH":
                body = self.read_body()
                report = next((item for item in db["reports"] if str(item["id"]) == parts[2]), None)
                if not report:
                    return self.send_json(404, {"error": "举报不存在"})
                report["status"] = "已封禁" if body.get("action") == "ban" else "已删除"
                write_db(db)
                return self.send_json(200, {"ok": True})

            return self.send_json(404, {"error": "接口不存在"})
        except Exception as exc:
            return self.send_json(500, {"error": str(exc)})


if __name__ == "__main__":
    ensure_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("")
    print("Qingyu forum server is running.")
    print(f"Computer link: http://localhost:{PORT}")
    addresses = local_addresses()
    if addresses:
        print("")
        print("Mobile links on the same Wi-Fi:")
        for address in addresses:
            print(f"  http://{address}:{PORT}")
    else:
        print("")
        print("No Wi-Fi/LAN address found. Make sure your computer is connected to Wi-Fi.")
    print("")
    print("Keep this window open while testing on your phone.")
    print("Press Ctrl+C to stop.")
    server.serve_forever()
