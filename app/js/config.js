/* ===== FALAJ — backend configuration =====
   Paste your Supabase project keys here to turn on REAL accounts + cloud sync.
   Leave both blank to keep running in on-device mode (data saved in this browser).

   Where to find them:  supabase.com  →  your project  →  Settings  →  API
     • Project URL      →  SUPABASE_URL
     • Project API keys →  anon  public  →  SUPABASE_ANON_KEY   (safe to publish)

   See app/README.md → "Turn on the backend" for the full 5-minute setup.

   ASSISTANT_URL — address of the Claude + MCP assistant server in /assistant
   (e.g. 'http://localhost:8787' or 'https://falaj-assistant.onrender.com').
   Leave blank to keep the offline keyword replies. See assistant/README.md. */
window.FALAJ_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  ASSISTANT_URL: '',
};
