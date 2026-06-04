const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const root = __dirname;
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4173);

const seed = {
  users: [],
  sessions: {},
  posts: [
    {
      id: 1,
      topic: "mbti",
      title: "ENFP 和 INTJ 真的容易互相吸引吗？",
      body: "最近发现身边很多朋友都在讨论 MBTI。想听听大家真实经历，哪些组合相处起来最有火花？",
      author: "晚风岛民",
      authorId: "seed-1",
      tags: ["ENFP", "本科", "上海"],
      likes: 128,
      comments: 2,
      createdAt: Date.now() - 12 * 60 * 1000,
      replies: [
        { id: 11, author: "岛民", body: "INTJ 路过，确实会被很有生命力的人吸引。", createdAt: Date.now() - 8 * 60 * 1000 },
        { id: 12, author: "青柠", body: "别太迷信类型，但它很适合用来打开话题。", createdAt: Date.now() - 6 * 60 * 1000 }
      ]
    },
    {
      id: 2,
      topic: "work",
      title: "刚工作半年，每天下班后只想躺着正常吗？",
      body: "从学校到职场以后，最大的感受是精力被抽干。大家是怎么恢复状态的？",
      author: "周一逃生",
      authorId: "seed-2",
      tags: ["INFP", "硕士", "互联网"],
      likes: 96,
      comments: 2,
      createdAt: Date.now() - 34 * 60 * 1000,
      replies: [
        { id: 21, author: "橘子", body: "正常，先保证睡眠和边界感。", createdAt: Date.now() - 20 * 60 * 1000 },
        { id: 22, author: "海盐", body: "不要把恢复也变成任务，慢慢来。", createdAt: Date.now() - 15 * 60 * 1000 }
      ]
    }
  ],
  reports: [
    { id: 101, postId: 1, title: "示例举报：疑似人身攻击回复", reason: "用户举报：含攻击性表达", status: "待处理", createdAt: Date.now() - 60 * 60 * 1000 }
  ]
};

function ensureDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) writeDb(seed);
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("请求内容太大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON 格式错误"));
      }
    });
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getCurrentUser(db, req) {
  const token = getToken(req);
  const userId = db.sessions[token];
  if (!userId) return null;
  return db.users.find((user) => user.id === userId) || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    bio: user.bio || "",
    mbti: user.mbti || "",
    education: user.education || "",
    city: user.city || "",
    industry: user.industry || "",
    publicTags: Boolean(user.publicTags)
  };
}

function publicPost(post) {
  return {
    ...post,
    time: relativeTime(post.createdAt),
    replies: post.replies.map((reply) => ({ ...reply, time: relativeTime(reply.createdAt) }))
  };
}

function relativeTime(time) {
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function makeId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function cleanText(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function userTags(user) {
  if (!user.publicTags) return [];
  return [user.mbti, user.education, user.city, user.industry].filter(Boolean);
}

async function handleApi(req, res) {
  const db = readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const user = getCurrentUser(db, req);

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      return send(res, 200, {
        user: publicUser(user),
        posts: db.posts.sort((a, b) => b.createdAt - a.createdAt).map(publicPost),
        reports: db.reports.sort((a, b) => b.createdAt - a.createdAt)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await parseBody(req);
      const name = cleanText(body.name, 18);
      if (!name) return send(res, 400, { error: "请填写昵称" });

      const userRecord = {
        id: crypto.randomUUID(),
        name,
        bio: "想找一个可以轻松说话的地方。",
        mbti: "",
        education: "",
        city: "",
        industry: "",
        publicTags: true,
        createdAt: Date.now()
      };
      const token = crypto.randomBytes(24).toString("hex");
      db.users.push(userRecord);
      db.sessions[token] = userRecord.id;
      writeDb(db);
      return send(res, 200, { token, user: publicUser(userRecord) });
    }

    if (!user) return send(res, 401, { error: "请先登录" });

    if (req.method === "PUT" && url.pathname === "/api/profile") {
      const body = await parseBody(req);
      user.name = cleanText(body.name, 18) || user.name;
      user.bio = cleanText(body.bio, 80);
      user.mbti = cleanText(body.mbti, 8).toUpperCase();
      user.education = cleanText(body.education, 12);
      user.city = cleanText(body.city, 16);
      user.industry = cleanText(body.industry, 16);
      user.publicTags = Boolean(body.publicTags);
      writeDb(db);
      return send(res, 200, { user: publicUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/posts") {
      const body = await parseBody(req);
      const title = cleanText(body.title, 40);
      const postBody = cleanText(body.body, 500);
      const topic = cleanText(body.topic, 16);
      if (!title || !postBody) return send(res, 400, { error: "标题和正文不能为空" });

      db.posts.unshift({
        id: makeId(),
        topic,
        title,
        body: postBody,
        author: user.name,
        authorId: user.id,
        tags: body.showTags ? userTags(user) : [],
        likes: 0,
        comments: 0,
        createdAt: Date.now(),
        replies: []
      });
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    const likeMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/like$/);
    if (req.method === "POST" && likeMatch) {
      const post = db.posts.find((item) => item.id === Number(likeMatch[1]));
      if (!post) return send(res, 404, { error: "帖子不存在" });
      post.likes += 1;
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    const replyMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/replies$/);
    if (req.method === "POST" && replyMatch) {
      const body = await parseBody(req);
      const post = db.posts.find((item) => item.id === Number(replyMatch[1]));
      const replyBody = cleanText(body.body, 220);
      if (!post) return send(res, 404, { error: "帖子不存在" });
      if (!replyBody) return send(res, 400, { error: "回复不能为空" });
      post.replies.unshift({ id: makeId(), author: user.name, body: replyBody, createdAt: Date.now() });
      post.comments = post.replies.length;
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    const reportMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/report$/);
    if (req.method === "POST" && reportMatch) {
      const post = db.posts.find((item) => item.id === Number(reportMatch[1]));
      if (!post) return send(res, 404, { error: "帖子不存在" });
      db.reports.unshift({
        id: makeId(),
        postId: post.id,
        title: post.title,
        reason: `用户 ${user.name} 举报：需要管理员复核`,
        status: "待处理",
        createdAt: Date.now()
      });
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    const reportActionMatch = url.pathname.match(/^\/api\/reports\/(\d+)$/);
    if (req.method === "PATCH" && reportActionMatch) {
      const body = await parseBody(req);
      const report = db.reports.find((item) => item.id === Number(reportActionMatch[1]));
      if (!report) return send(res, 404, { error: "举报不存在" });
      report.status = body.action === "ban" ? "已封禁" : "已删除";
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "接口不存在" });
  } catch (error) {
    return send(res, 500, { error: error.message || "服务器错误" });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function localAddresses() {
  const addresses = [];
  for (const items of Object.values(os.networkInterfaces())) {
    for (const item of items || []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}

ensureDb();

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`轻屿论坛已启动: http://localhost:${port}`);
  for (const address of localAddresses()) {
    console.log(`同一 Wi-Fi 下可尝试访问: http://${address}:${port}`);
  }
});
