import './style.css';
import { createApp } from './ui.js';

// Fetch and apply default login theme before app initialization
async function initApp() {
  try {
    // Try to load saved user theme first (for returning logged-in users)
    const savedAuth = localStorage.getItem('diary.auth');
    let userTheme = null;
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth);
        userTheme = auth.user?.theme;
      } catch { /* ignore */ }
    }

    // If no user theme, fetch default login theme from admin settings
    if (!userTheme) {
      try {
        const res = await fetch('/api/site-settings');
        if (res.ok) {
          const data = await res.json();
          if (data.defaultLoginTheme) {
            document.documentElement.setAttribute('data-theme', data.defaultLoginTheme);
          }
        }
      } catch { /* ignore - will use default theme */ }
    } else {
      // Apply user's saved theme
      document.documentElement.setAttribute('data-theme', userTheme);
    }
  } catch { /* ignore errors during theme init */ }

  // Now initialize the app
  try {
    createApp(document.querySelector('#app'));
  } catch (e) {
    console.error('[DiaryApp crash]', e);
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-size:13px;white-space:pre-wrap">[DiaryApp crash] ${e?.stack || e?.message || e}</pre>`;
  }
}

initApp();
