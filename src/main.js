import './style.css';
import { createApp } from './ui.js';

try {
  createApp(document.querySelector('#app'));
} catch (e) {
  console.error('[DiaryApp crash]', e);
  document.body.innerHTML = `<pre style="color:red;padding:20px;font-size:13px;white-space:pre-wrap">[DiaryApp crash] ${e?.stack || e?.message || e}</pre>`;
}
