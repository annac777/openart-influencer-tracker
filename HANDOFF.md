# Influencer Tracker Handoff

## What This Is
A dashboard that tracks our AI influencer partners' Instagram posting activity — whether they're posting their required weekly collabs with @openart_ai, engagement metrics (likes/comments), and compliance rates.

## What It Can Do
- **Track weekly compliance**: Shows if each influencer posted their required collab post each week (Branded / Posted / Missed)
- **Distinguish post types**: Collab posts (co-authored, count toward compliance) vs @mentions (caption only, don't count)
- **Auto-fetch post data**: Paste an Instagram URL → click Fetch → auto-grabs caption, likes, comments, collab status
- **Snapshot metrics**: Save current engagement numbers, then compare growth over time
- **Export CSV report**: Full report with overview stats (total reach, compliance rate, posts), per-partner breakdown, weekly grid, and every post's details

## Where It Lives
- **Repo**: https://github.com/annac777/openart-influencer-tracker (private — ask Anna to add you as collaborator)
- **Runs locally** on `localhost:3456`

## Getting Started

```bash
git clone https://github.com/annac777/openart-influencer-tracker.git
cd openart-influencer-tracker
npm install
npm start
# Open http://localhost:3456
```

## Day-to-Day Operations

### When an influencer posts a new @openart collab
1. Open `localhost:3456`
2. Click the influencer in the sidebar
3. Click **+ Add Post**
4. Paste the Instagram post URL → click **Fetch**
5. It auto-fills caption, likes, comments, and detects if it's a collab or @mention
6. Enter the date manually (format: `Apr 7`) since embeds don't expose dates
7. Check **Branded** if the post promotes a specific feature (Vellum, Suite, Kling, 3D Worlds)
8. Click **Add Post**

### When a new week starts
Add the new week to the `WEEKS` array and `bounds` array in `index.html`:
```js
const WEEKS = ['Feb 9','Feb 16', ... ,'Apr 13'];  // add new week
const bounds = [[1,9],[1,16], ... ,[3,13]];        // add [month_0indexed, day]
```

### When you want to save a metrics checkpoint
Click **Snapshot** — saves all current likes/comments to `snapshots.json`. After 2+ snapshots, post cards show growth deltas.

### When you need a report
Click **Export** — downloads a CSV with everything: overview stats, partner summary, weekly compliance grid, and all post details.

### When a new influencer joins
Add them to the `influencers` array in `index.html` (see README for template).

## Using Claude Code for Updates

### Scan for new posts (weekly)
Tell Claude Code:
```
Go to each influencer's Instagram profile using Chrome MCP and check
for new @openart_ai collab posts from the past week. For any new posts
found, add them to the tracker with the correct data.
```

### Verify/update metrics on existing posts
```
Go through all posts in the tracker that are missing likes/comments data
and fetch the current metrics from Instagram using Chrome MCP.
```

### Set up a scheduled check-in
```
Set up a weekly task: every Monday, scan all influencer IG profiles for
new @openart_ai posts, update the tracker, take a snapshot, and flag
anyone who missed their weekly post.
```

## File Structure
| File | What it does |
|---|---|
| `index.html` | Dashboard UI + all influencer/post data (hardcoded) |
| `server.js` | Express backend — fetch-post API, snapshots, post storage |
| `posts.json` | Posts added via the UI (auto-created, gitignored) |
| `snapshots.json` | Metric snapshots (auto-created, gitignored) |
| `README.md` | Full technical docs, API reference, setup instructions |

## Key Concepts
- **Collab** = Instagram's co-author feature (both accounts at top of post) → counts toward weekly compliance
- **@Mention** = just tagged in caption → tracked but doesn't count
- **Branded** = promotes a specific OpenArt feature (Vellum, Suite, Kling, etc.)
- **Compliance** = % of weeks with at least 1 collab post since their start date
- **Start date** = adjustable per influencer (input field next to weekly grid)
