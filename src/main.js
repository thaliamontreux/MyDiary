import './style.css';
import { createApp } from './ui.js';

// Load theme-specific CSS for custom themes
function loadThemeCSS(themeId) {
  if (!themeId) return;

  // Remove old theme stylesheets
  document.querySelectorAll('link[data-theme-css]').forEach(el => el.remove());

  // Don't load CSS for built-in themes (they're in style.css)
  const BUILTIN_THEMES = new Set([
    'dark', 'light',
    'trans-pride-dark','elegant-dark','support-dark','abstract-dark','community-dark',
    'flowing-rivers-dark','journey-dark','abstract-shapes-dark','strength-dark','constellation-night',
    'trans-pride-light','blooming-light','support-light','abstract-light','community-light',
    'sunrise-hope','journey-light','soft-abstract-light','pride-light','modern-abstract-light'
  ]);

  if (BUILTIN_THEMES.has(themeId)) {
    return; // Built-in themes use CSS variables already in style.css
  }

  // Load custom theme CSS from themes directory
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/themes/${themeId}/theme.css`;
  link.setAttribute('data-theme-css', themeId);
  document.head.appendChild(link);
}

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
            loadThemeCSS(data.defaultLoginTheme);
          }
        }
      } catch { /* ignore - will use default theme */ }
    } else {
      // Apply user's saved theme
      document.documentElement.setAttribute('data-theme', userTheme);
      loadThemeCSS(userTheme);
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
