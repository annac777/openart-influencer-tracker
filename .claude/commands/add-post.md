Add an Instagram post to the tracker. The user will provide one or more Instagram URLs.

For each URL:
1. Use Chrome MCP to navigate to the post
2. Take a screenshot and read the page to extract:
   - Date (shown on the post)
   - Caption (first ~80 chars)
   - Likes count
   - Comments count
   - Is it a COLLAB post? (both accounts shown as co-authors at the top, e.g. "username and openart_ai")
   - Does it mention any OpenArt features? (Vellum, Suite, Kling, 3D Worlds, Wonder)
   - Which influencer handle posted it

3. Add the post to that influencer's openartPosts array in index.html:
   ```js
   { text: "Collab w/ <span class='mention'>@openart_ai</span> — [short caption]", time: "[Mon DD]", likes: [N], comments: [N], url: "[URL]", collab: [true/false], branded: [true/false] }
   ```

4. If the post date falls in a new week not yet in WEEKS array, extend it.

5. Restart server: `lsof -ti:3456 | xargs kill -9; nohup /usr/local/bin/node server.js > server.log 2>&1 &`
6. Commit and push.
