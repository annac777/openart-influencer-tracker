Scan all influencer Instagram profiles for new @openart_ai collab posts.

For each influencer in the tracker (shudu.gram, fit_aitana, the.monster.library, millasofiafin, dollydoesvlogs, leyalovenature, mia.maldinii):

1. Use Chrome MCP to navigate to their Instagram profile
2. Click through their most recent 6-8 posts in the grid
3. For each post, check if it's a collab with openart_ai (shows both names at the top) or mentions @openart_ai in the caption
4. Skip posts already in the tracker — only report NEW ones
5. For new posts found, extract: URL, date, caption (short), likes, comments, collab or @mention, any OpenArt features (Vellum/Suite/Kling/3D Worlds/Wonder)

After scanning, update the tracker:
- Add new posts to the influencer data in index.html with correct collab/branded flags
- Extend the WEEKS array and bounds if a new week has started
- Restart the server: `lsof -ti:3456 | xargs kill -9; nohup /usr/local/bin/node server.js > server.log 2>&1 &`
- Commit and push to GitHub
