# Graph Studio: setup

Everything here is free and needs no terminal. The studio works straight away. Accounts, the community wall, publishing and live editing switch on once you add Firebase (about 10 minutes).

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | The app |
| `css/app.css` | All the styling |
| `js/config.js` | **The only file you edit.** Your Firebase config goes here |
| `js/*.js` | The app's code (studio, charts, community, sharing, exports) |
| `database.rules.json` | Security rules to paste into Firebase |
| `404.html`, `_redirects`, `vercel.json` | Make pretty links like `/graph/johncenagrades2025/preview` work on GitHub Pages, Netlify and Vercel |

You can double-click `index.html` to try the studio on your computer. Signing in only works once the site is online (step 5).

---

## 1. Create a Firebase project (free)

1. Go to <https://console.firebase.google.com> and click **Create a project** (or **Add project**).
2. Give it a name, e.g. `graph-studio`. Google Analytics isn't needed, so you can switch it off.
3. Stay on the free **Spark** plan. Nothing here needs billing.

## 2. Register the web app and paste the config

1. On the project's home page, click the **Web** icon (`</>`), or open the gear → **Project settings** → **General** → **Your apps** → **Add app** → **Web**.
2. Type a nickname, leave **Firebase Hosting** unticked, and click **Register app**.
3. Firebase shows a `firebaseConfig = { … }` block. Copy the values into **`js/config.js`**, replacing the placeholders:

```js
window.GRAPH_STUDIO_CONFIG = {
  firebase: {
    apiKey: "AIza…",
    authDomain: "graph-studio-1234.firebaseapp.com",
    databaseURL: "https://graph-studio-1234-default-rtdb.firebaseio.com",
    projectId: "graph-studio-1234",
    storageBucket: "graph-studio-1234.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abc123"
  },
  googleClientId: "",
  routing: "auto"
};
```

The Firebase API key is meant to be public in web apps. The database rules in step 3 are what keep data safe.

## 3. Turn on the Realtime Database and paste the rules

1. In the left menu open **Realtime Database** (under **Build**, or **Databases & Storage** in newer consoles) → **Create database**.
2. Pick the location closest to you and start in **locked mode**.
3. Open the **Rules** tab, delete what's there, paste the whole of **`database.rules.json`**, and click **Publish**.
4. On the **Data** tab, copy the URL at the top (it ends in `firebaseio.com` or `firebasedatabase.app`). If your config from step 2 has no `databaseURL`, or a different one, paste this URL in as `databaseURL`.

What the rules allow:
- Anyone can read published graphs, profiles and like counts. Only the owner can change or unpublish a graph.
- Usernames and links (`graph/<link>/preview`) are unique, so nobody can take yours.
- Live graphs are private: only the owner and people who joined with an invite link can read or edit them, see cursors or read the invite.
- Each person can only like as themselves and only edit their own profile.

## 4. Turn on sign-in

1. Open **Authentication** → **Get started** → **Sign-in method**.
2. Enable **Email/Password** (the first switch only) and save.
3. Enable **Google**, pick your support email, and save.

## 5. Put the site online (free, drag and drop)

Pick one.

**Netlify Drop**
1. Go to <https://app.netlify.com/drop> and sign up for a free account (sites made without an account are deleted after a while).
2. Drag the whole `graph-studio` folder onto the page. You get a link like `https://something.netlify.app`.
3. To rename it: **Site configuration** → **Change site name**.
4. To update later, open the site's **Deploys** tab and drag the folder in again.

**GitHub Pages**
1. Create a new public repository on <https://github.com>.
2. Click **Add file** → **Upload files**, drag in everything inside the `graph-studio` folder (not the folder itself), and **Commit**.
3. Go to **Settings** → **Pages** → **Deploy from a branch** → `main` / `(root)` → **Save**.
4. After a minute your site is at `https://<your-username>.github.io/<repo-name>/`.

Then, back in Firebase: **Authentication** → **Settings** → **Authorized domains** → **Add domain**, and add your site's domain, e.g. `something.netlify.app` or `<your-username>.github.io` (no `https://`, no path). Without this, sign-in stops with an "unauthorized domain" message.

## 6. Try it

1. Open your site, click **Sign in** → **Create an account**, then pick a username, photo and bio.
2. **Share** → **Publish** puts the graph on the community wall at `…/graph/<link>/preview`.
3. **Share** → **Live together** → **Start live session**, then send the invite link. Whoever opens it signs in and edits with you, and you see each other's cursors.
4. **Share** → **Link** works without any account: the graph is packed inside the link itself.

## 7. Optional: create Google Sheets and Slides directly

Without this step the Export menu already copies your table into a new Google Sheet (paste with Ctrl+V) and downloads a `.pptx` you can open in Google Slides (**File** → **Import slides**). This step adds **Create sheet** and **Create slides** buttons that make the files in your Google Drive for you, with a real chart in the sheet.

1. Open <https://console.cloud.google.com> and pick the **same project** as your Firebase project (top bar).
2. **APIs & Services** → **Library** → search and **Enable** both **Google Drive API** and **Google Sheets API**.
3. **APIs & Services** → **Credentials** → open **Web client (auto created by Google Service)** (it appears after you enable Google sign-in in step 4).
4. Under **Authorized JavaScript origins**, click **Add URI** and enter your site, e.g. `https://something.netlify.app` (no trailing slash, no path). **Save**.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into `googleClientId` in `js/config.js`, and upload the folder again.

The app only asks for the `drive.file` permission, which lets it touch the files it creates and nothing else in your Drive. Changes to Google settings can take a few minutes to start working.

## Pretty links

`routing: "auto"` gives links like `/graph/johncenagrades2025/preview` on Netlify (thanks to `_redirects`), GitHub Pages (thanks to `404.html`) and Vercel (thanks to `vercel.json`). On any other host, if those links show a "not found" page, set `routing: "hash"` and links become `/#/graph/johncenagrades2025/preview`, which work everywhere.

## Free plan limits

Firebase's free Spark plan gives the Realtime Database 1 GB of storage, 10 GB of downloads a month and 100 people connected at once. That's plenty for a small community; live cursors use a little bandwidth only while people are editing together. Profile photos are shrunk to 192×192 before they're saved.

## If something doesn't work

| You see | Fix |
|---|---|
| "…needs Firebase" | `js/config.js` still has the placeholders, or `databaseURL` is missing |
| "Firebase refused that" / permission errors | The rules from `database.rules.json` weren't published (step 3) |
| "unauthorized domain" when signing in | Add your site's domain under Authentication → Settings → Authorized domains |
| "Turn on this sign-in method" | Enable Email/Password or Google (step 4) |
| Google sign-in pop-up closes straight away | Allow pop-ups for your site |
| "Turn on the Google Sheets API" | Step 7.2, then wait a few minutes |
| Pretty links show "not found" | Set `routing: "hash"` in `js/config.js` |
