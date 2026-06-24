/* ===== FALAJ — backend layer (Supabase, with on-device fallback) =====
   When config.js holds valid keys, BK.enabled is true and the app uses real
   email/password auth + a cloud `app_state` row per user. Otherwise everything
   falls back to localStorage and the app behaves exactly as the prototype. */

const _CFG = (typeof window !== 'undefined' && window.FALAJ_CONFIG) || {};

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
}

const BK = {
  enabled: !!(_CFG.SUPABASE_URL && _CFG.SUPABASE_ANON_KEY),
  client: null,
  user: null,

  async init() {
    if (!this.enabled) return null;
    try {
      if (!(window.supabase && window.supabase.createClient)) {
        await _loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      }
      this.client = window.supabase.createClient(_CFG.SUPABASE_URL, _CFG.SUPABASE_ANON_KEY);
      const { data } = await this.client.auth.getSession();
      this.user = (data && data.session && data.session.user) || null;
      return this.user;
    } catch (e) { console.warn('FALAJ backend init failed, using local mode:', e); this.enabled = false; return null; }
  },

  async signUp(email, password, name) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { data: { name: name || '' } } });
    if (error) return { error: error.message };
    this.user = data.user;
    // If email-confirmation is off, a session is returned and we're logged in.
    return { user: data.user, needsConfirm: !data.session };
  },

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    this.user = data.user;
    return { user: data.user };
  },

  async signOut() { try { if (this.client) await this.client.auth.signOut(); } catch (e) {} this.user = null; },

  async pull() {
    if (!this.user) return null;
    try {
      const { data } = await this.client.from('app_state').select('state').eq('user_id', this.user.id).maybeSingle();
      return (data && data.state) || null;
    } catch (e) { return null; }
  },

  async push(state) {
    if (!this.user) return;
    try {
      await this.client.from('app_state').upsert({ user_id: this.user.id, state, updated_at: new Date().toISOString() });
    } catch (e) {}
  },
};
