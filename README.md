# OpenArt Influencer Tracker

Internal dashboard for tracking AI influencer partnerships, weekly posting compliance, and engagement metrics.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3456
```

## Features

- **Dashboard**: Overview of all partners with compliance rates, total reach, likes, comments
- **Weekly Compliance**: Tracks whether each influencer posts at least 1 collab/week
- **Post Management**: Add posts via URL with auto-fetch (scrapes Instagram embed for likes/comments/caption)
- **Snapshots**: Save metrics at a point in time, track growth between snapshots
- **Export**: Download full CSV report with overview stats, partner summary, weekly grid, and post details

## How It Works

### Adding a New Post
1. Click on an influencer in the sidebar
2. Click **+ Add Post**
3. Paste the Instagram URL and click **Fetch** — it auto-fills caption, likes, comments, collab type, and branded status
4. Adjust any fields if needed (date must be entered manually since embeds don't expose it)
5. Click **Add Post** — saved to `posts.json`

### Collab vs @Mention
- **Collab**: Both accounts shown as co-authors at the top of the post (e.g. "dollydoesvlogs and openart_ai"). These count toward weekly compliance.
- **@Mention**: Only mentioned in the caption text. These do NOT count toward weekly compliance.

### Branded Posts
Posts that promote a specific OpenArt feature (Vellum, Suite, Kling, 3D Worlds, Wonder) are tagged as **Branded**. Regular collabs that just say "Made in @openart_ai" are not branded.

### Taking a Snapshot
Click **Snapshot** in the top right to save current metrics. After 2+ snapshots, post cards show growth deltas (e.g. +500 likes since last snapshot).

### Exporting a Report
Click **Export** to download a CSV with:
- Overview (total reach, partners, posts, likes, comments, compliance rate)
- Per-partner summary (followers, collab/mention/branded counts, contract info)
- Weekly compliance grid (Branded/Posted/MISSED/N/A per week)
- All post details (URL, date, type, engagement)

### Extending the Timeline
When a new week starts, update the `WEEKS` array and `bounds` array in `index.html`:

```js
// Add new week to the end
const WEEKS = ['Feb 9','Feb 16','Feb 23','Mar 2','Mar 9','Mar 16','Mar 23','Mar 30','Apr 6','Apr 13'];

// Add corresponding bounds entry [month_index, day] (month is 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3)
const bounds = [[1,9],[1,16],[1,23],[2,2],[2,9],[2,16],[2,23],[2,30],[3,6],[3,13]];
```

### Adding a New Influencer
Add to the `influencers` array in `index.html`:

```js
{
  name: "New Person", handle: "ig_handle", platform: "Instagram",
  followers: 50000, type: "AI Creator", status: "signed",
  creator: "Manager Name", color: "#e17055",
  igUrl: "https://www.instagram.com/ig_handle/",
  startDate: "Mar 23",
  contract: { period: "6 months", deliverable: "1 post/week", cash: "$5,000", credits: "—", affiliate: "—" },
  openartPosts: [],
  otherPosts: []
}
```

## Using with Claude Code

### Initial Setup
```bash
git clone https://github.com/annac777/openart-influencer-tracker.git
cd openart-influencer-tracker
npm install
npm start
```

### Scheduled Check-in (Weekly)
Ask Claude Code to set up a recurring task:

```
Set up a weekly check-in every Monday at 10am:
1. Go to each influencer's Instagram profile using Chrome MCP
2. Check their last 7 days of posts for any @openart_ai collabs or mentions
3. For new posts found, fetch the embed data and add them to the tracker
4. Update the WEEKS array if a new week has started
5. Take a snapshot of current metrics
6. Flag any influencers who missed their weekly post
7. Push updates to GitHub
```

### Manual Scrape (All Profiles)
Tell Claude Code:
```
Go to each influencer profile in the tracker and check for new @openart_ai posts
since [date]. For each new post, get the URL, then use the /api/fetch-post endpoint
to grab metrics. Add any new posts and update the data.
```

### Fetch a Specific Post
```
Fetch this Instagram post and add it to [influencer name]'s data:
https://www.instagram.com/p/XXXXX/
```

### Export Report
```
Open http://localhost:3456 and click the Export button, or generate a summary
of current compliance and engagement stats.
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/posts` | GET | Get all manually added posts |
| `/api/posts` | POST | Add a new post `{handle, text, time, likes, comments, views, url, isOpenArt}` |
| `/api/posts/:handle/:idx` | DELETE | Delete a post |
| `/api/fetch-post?url=...` | GET | Scrape an Instagram post via embed (no login needed) |
| `/api/snapshots` | GET | Get all metric snapshots |
| `/api/snapshots` | POST | Save a new snapshot `{posts: [{handle, url, likes, comments, views}]}` |

## Data Files

| File | Purpose | Gitignored? |
|---|---|---|
| `index.html` | Main dashboard + hardcoded influencer data | No |
| `server.js` | Express backend + fetch/snapshot APIs | No |
| `posts.json` | Manually added posts (via Add Post UI) | Yes |
| `snapshots.json` | Metric snapshots for growth tracking | Yes |

## Future Improvements

- **Apify integration**: Use Apify actors to scrape full IG post data (views, shares) on a schedule, synced via n8n to a Google Sheet
- **X / Twitter support**: Add X post tracking using official API (rate-limited but free tier available)
- **Multi-platform dashboard**: Add TikTok, LinkedIn, YouTube columns
- **Auto-deploy**: Connect GitHub repo to Render/Vercel for public access
- **Google Sheets sync**: Two-way sync with the existing partnership spreadsheet
- **Historical charts**: Visualize engagement trends over time per influencer
- **Notifications**: Slack/email alerts when an influencer misses a week
