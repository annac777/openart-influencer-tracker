const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(__dirname));

// ===== DATA DIRECTORY (supports Render persistent disk at /data) =====
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;

// ===== POSTS DATABASE (JSON file) =====
const DB_FILE = path.join(DATA_DIR, 'posts.json');

function loadDB() {
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return {};
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// GET all added posts
app.get('/api/posts', (req, res) => {
  res.json(loadDB());
});

// POST a new post for an influencer
// body: { handle, text, time, likes, comments, views, url, isOpenArt }
app.post('/api/posts', (req, res) => {
  const { handle, text, time, likes, comments, views, url, isOpenArt } = req.body;
  if (!handle || !time) return res.status(400).json({ error: 'handle and time required' });

  const db = loadDB();
  if (!db[handle]) db[handle] = [];

  const post = {
    text: text || '',
    time,
    likes: parseInt(likes) || 0,
    comments: parseInt(comments) || 0,
    views: parseInt(views) || 0,
    url: url || '',
    isOpenArt: isOpenArt !== false,
    addedAt: new Date().toISOString()
  };

  db[handle].push(post);
  saveDB(db);
  res.json({ ok: true, post });
});

// ===== FETCH SINGLE POST METADATA =====
const https = require('https');
const http = require('http');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseMeta(html) {
  const result = { title: '', description: '', type: '', date: '', likes: 0, comments: 0 };

  // Parse og:description - often contains "X likes, Y comments - Author: caption"
  const ogDesc = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]*)"/i);
  if (ogDesc) {
    result.description = ogDesc[1];
    // Try to parse likes/comments from "123 likes, 45 comments"
    const likesMatch = ogDesc[1].match(/([\d,]+)\s*likes?/i);
    const commentsMatch = ogDesc[1].match(/([\d,]+)\s*comments?/i);
    if (likesMatch) result.likes = parseInt(likesMatch[1].replace(/,/g, ''));
    if (commentsMatch) result.comments = parseInt(commentsMatch[1].replace(/,/g, ''));
  }

  // Parse og:title
  const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"/i);
  if (ogTitle) result.title = ogTitle[1];

  // Parse title tag
  const titleTag = html.match(/<title>([^<]*)<\/title>/i);
  if (titleTag) result.title = result.title || titleTag[1];

  // Try to find date from JSON-LD or time element
  const timeMatch = html.match(/"uploadDate"\s*:\s*"([^"]*)"/);
  if (timeMatch) result.date = timeMatch[1];

  // Check if @openart_ai or openart is mentioned
  const lowerHtml = (result.description + ' ' + result.title).toLowerCase();
  result.mentionsOpenArt = lowerHtml.includes('openart') || lowerHtml.includes('@openart');

  // Check collab vs mention
  if (lowerHtml.includes('collab')) result.type = 'collab';
  else if (result.mentionsOpenArt) result.type = '@mention';

  // Check for branded features
  const features = ['vellum', 'suite', 'kling', 'wonder'];
  result.branded = features.some(f => lowerHtml.includes(f));

  return result;
}

app.get('/api/fetch-post', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const html = await fetchUrl(url);
    const meta = parseMeta(html);

    // Format date to "Mon DD" format
    let formattedDate = '';
    if (meta.date) {
      const d = new Date(meta.date);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      formattedDate = months[d.getMonth()] + ' ' + d.getDate();
    }

    res.json({
      ok: true,
      title: meta.title,
      caption: meta.description,
      date: formattedDate,
      likes: meta.likes,
      comments: meta.comments,
      mentionsOpenArt: meta.mentionsOpenArt,
      type: meta.type,
      branded: meta.branded,
      raw: { ogTitle: meta.title, ogDesc: meta.description }
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ===== SCRAPER API =====
const { exec } = require('child_process');
const SCRAPE_DATA = path.join(__dirname, 'scrape-data.json');
let scrapeProcess = null;

// GET scrape status / results
app.get('/api/scrape', (req, res) => {
  const data = fs.existsSync(SCRAPE_DATA)
    ? JSON.parse(fs.readFileSync(SCRAPE_DATA, 'utf8'))
    : null;
  res.json({
    running: !!scrapeProcess,
    lastRun: data?._lastRun || null,
    data
  });
});

// POST trigger a scrape
// body: { mode: "quick" | "deep" | "single", handle?: "russo.ai" }
app.post('/api/scrape', (req, res) => {
  if (scrapeProcess) {
    return res.status(409).json({ error: 'Scrape already running' });
  }

  const { mode, handle } = req.body || {};
  let args = '';
  if (mode === 'deep') args = '--deep';
  if (mode === 'single' && handle) args = `--handle=${handle}`;

  const cmd = `node ${path.join(__dirname, 'scrape.js')} ${args}`;
  console.log(`  🚀 Starting scrape: ${cmd}`);

  const logLines = [];
  scrapeProcess = exec(cmd, { cwd: __dirname, timeout: 300000 });

  scrapeProcess.stdout.on('data', d => {
    const line = d.toString();
    logLines.push(line);
    process.stdout.write(line);
  });
  scrapeProcess.stderr.on('data', d => {
    logLines.push(d.toString());
    process.stderr.write(d.toString());
  });

  scrapeProcess.on('close', (code) => {
    console.log(`  Scrape finished (exit ${code})`);
    scrapeProcess = null;
  });

  res.json({ ok: true, mode: mode || 'quick', handle });
});

// GET scrape logs (SSE stream for live updates)
app.get('/api/scrape/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    const data = fs.existsSync(SCRAPE_DATA)
      ? JSON.parse(fs.readFileSync(SCRAPE_DATA, 'utf8'))
      : null;
    res.write(`data: ${JSON.stringify({ running: !!scrapeProcess, data })}\n\n`);
    if (!scrapeProcess) {
      clearInterval(interval);
      res.write('data: {"done": true}\n\n');
      res.end();
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

// ===== METRIC SNAPSHOTS (time-series tracking) =====
const SNAP_FILE = path.join(DATA_DIR, 'snapshots.json');

function loadSnapshots() {
  if (fs.existsSync(SNAP_FILE)) return JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8'));
  return { snapshots: [] };
}

function saveSnapshots(data) {
  fs.writeFileSync(SNAP_FILE, JSON.stringify(data, null, 2));
}

// GET all snapshots
app.get('/api/snapshots', (req, res) => {
  res.json(loadSnapshots());
});

// POST a new snapshot (records current metrics for all posts)
// body: { posts: [{ handle, url, likes, comments, views }] }
app.post('/api/snapshots', (req, res) => {
  const { posts } = req.body;
  if (!posts || !Array.isArray(posts)) return res.status(400).json({ error: 'posts array required' });

  const data = loadSnapshots();
  const snapshot = {
    timestamp: new Date().toISOString(),
    metrics: {}
  };

  posts.forEach(p => {
    const key = p.url || `${p.handle}:${p.time}`;
    snapshot.metrics[key] = {
      handle: p.handle,
      likes: parseInt(p.likes) || 0,
      comments: parseInt(p.comments) || 0,
      views: parseInt(p.views) || 0
    };
  });

  data.snapshots.push(snapshot);
  // Keep last 100 snapshots max
  if (data.snapshots.length > 100) data.snapshots = data.snapshots.slice(-100);
  saveSnapshots(data);
  res.json({ ok: true, count: Object.keys(snapshot.metrics).length });
});

// GET growth for a specific post URL (compares latest vs previous snapshot)
app.get('/api/growth/:url', (req, res) => {
  const url = decodeURIComponent(req.params.url);
  const data = loadSnapshots();
  const snaps = data.snapshots;
  if (snaps.length < 2) return res.json({ growth: null });

  const latest = snaps[snaps.length - 1].metrics[url];
  const prev = snaps[snaps.length - 2].metrics[url];
  if (!latest || !prev) return res.json({ growth: null });

  res.json({
    growth: {
      likes: latest.likes - prev.likes,
      comments: latest.comments - prev.comments,
      views: latest.views - prev.views,
      period: {
        from: snaps[snaps.length - 2].timestamp,
        to: snaps[snaps.length - 1].timestamp
      }
    }
  });
});

// DELETE a post
app.delete('/api/posts/:handle/:idx', (req, res) => {
  const db = loadDB();
  const { handle, idx } = req.params;
  if (db[handle] && db[handle][parseInt(idx)]) {
    db[handle].splice(parseInt(idx), 1);
    saveDB(db);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'not found' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  OpenArt Influencer Tracker`);
  console.log(`  ─────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${getLocalIP()}:${PORT}\n`);
});

function getLocalIP() {
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
