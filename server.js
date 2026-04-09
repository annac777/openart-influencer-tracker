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

// ===== FETCH SINGLE POST METADATA (via embed — no login, no browser) =====
const https = require('https');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function scrapeInstagramPost(url) {
  // Use /embed/captioned/ — public, has caption + likes + comments
  const embedUrl = url.replace(/\/?(\?.*)?$/, '') + '/embed/captioned/';
  const html = await fetchHtml(embedUrl);

  const result = { caption: '', date: '', likes: 0, comments: 0, isCollab: false, authors: [], features: [] };

  // Caption
  const capMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
  if (capMatch) {
    result.caption = capMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 300);
    // Remove leading username from caption
    result.caption = result.caption.replace(/^[\w.]+/, '').trim();
  }

  // Likes
  const likeMatch = html.match(/([\d,]+)\s*likes?/i);
  if (likeMatch) result.likes = parseInt(likeMatch[1].replace(/,/g, ''));

  // Comments
  const commentMatch = html.match(/([\d,]+)\s*comments?/i);
  if (commentMatch) result.comments = parseInt(commentMatch[1].replace(/,/g, ''));

  // Date
  const dateMatch = html.match(/datetime="([^"]*)"/);
  if (dateMatch) result.date = dateMatch[1];
  // Fallback: look for text date
  if (!result.date) {
    const textDate = html.match(/title="([^"]*\d{4}[^"]*)"/);
    if (textDate) result.date = textDate[1];
  }

  // Authors — find instagram.com/username links
  const authorMatches = [...html.matchAll(/instagram\.com\/([\w.]+)\//g)]
    .map(m => m[1])
    .filter(a => !['p','reel','explore','static','rsrc.php','v','developer','about','accounts'].includes(a));
  result.authors = [...new Set(authorMatches)];
  result.isCollab = result.authors.includes('openart_ai');

  // Features + OpenArt mention
  const lower = result.caption.toLowerCase();
  const featureList = ['vellum', 'suite', 'kling', '3d worlds', 'wonder'];
  result.features = featureList.filter(f => lower.includes(f));
  result.mentionsOpenArt = lower.includes('openart') || lower.includes('@openart_ai') || result.isCollab;

  // Format date
  let formattedDate = '';
  if (result.date) {
    try {
      const d = new Date(result.date);
      if (!isNaN(d)) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        formattedDate = months[d.getMonth()] + ' ' + d.getDate();
      }
    } catch(_) {}
  }

  return {
    ok: true,
    caption: result.caption,
    date: formattedDate,
    likes: result.likes,
    comments: result.comments,
    isCollab: result.isCollab,
    authors: result.authors,
    mentionsOpenArt: result.mentionsOpenArt,
    branded: result.features.length > 0,
    features: result.features,
    type: result.isCollab ? 'collab' : (result.mentionsOpenArt ? '@mention' : '')
  };
}

app.get('/api/fetch-post', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const data = await scrapeInstagramPost(url);
    res.json(data);
  } catch (e) {
    console.error('Fetch post error:', e.message);
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
