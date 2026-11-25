/* ============================================================
   Graph Studio · YOUR SETTINGS  (this is the only file you edit)
   ------------------------------------------------------------
   1. Firebase: paste the config object from
      Firebase console → Project settings (gear) → General →
      "Your apps" → your web app → "SDK setup and configuration" → Config.
      Make sure databaseURL is there (copy it from Realtime Database
      if your snippet doesn't have it).
      Leave the placeholders to use the studio without accounts.

   2. googleClientId (optional): lets the Export menu create real
      Google Sheets and Google Slides. See SETUP.md, step 7.

   3. routing: "auto" gives pretty links like
      /graph/johncenagrades2025/preview on Netlify, GitHub Pages and
      Vercel. Set "hash" if those links 404 on your host.
   ============================================================ */
window.GRAPH_STUDIO_CONFIG = {
  firebase: {
    apiKey: "AIzaSyD00Chpa_mtU-Pbbg-Q7cmbPo3OoIh14Lo",
    authDomain: "graph-aca32.firebaseapp.com",
    databaseURL: "https://graph-aca32-default-rtdb.firebaseio.com",
    projectId: "graph-aca32",
    storageBucket: "graph-aca32.firebasestorage.app",
    messagingSenderId: "50671281790",
    appId: "1:50671281790:web:428cfa0fe21ca2e15c5a2f"
  },

  googleClientId: "",

  routing: "auto"
};
