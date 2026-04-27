import './style.css';
import { createApp } from './ui.js';

// Fetch and apply default login theme before app initialization
async function initApp() {
  try {
    // Fetch default login theme from admin settings
    const res = await fetch('/api/site-settings');
    if (res.ok) {
      const data = await res.json();
      if (data.defaultLoginTheme) {
        let themeId = data.defaultLoginTheme;
        if (themeId === 'light') themeId = 'trans-pride-light';
        if (themeId === 'dark') themeId = 'trans-pride-dark';

        document.documentElement.setAttribute('data-theme', themeId);
        const bg = `themes/${themeId}/background.webp`;
        document.documentElement.style.setProperty('--bg-image', `url('/${bg}')`);
      }
    }
  } catch { /* ignore - will use default theme */ }

  // Now initialize the app
  try {
    createApp(document.querySelector('#app'));
  } catch (e) {
    console.error('[DiaryApp crash]', e);
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-size:13px;white-space:pre-wrap">[DiaryApp crash] ${e?.stack || e?.message || e}</pre>`;
  }
}

initApp();
