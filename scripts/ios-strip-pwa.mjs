import fs from 'fs';
import path from 'path';

/** iOS App 內不需要 PWA Service Worker，保留在實機上可能導致黑屏 */
const publicDir = path.resolve('ios/App/App/public');
const swPath = path.join(publicDir, 'sw.js');

if (fs.existsSync(swPath)) {
  fs.unlinkSync(swPath);
  console.log('[ios-strip-pwa] removed sw.js');
}
