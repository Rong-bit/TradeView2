import fs from 'fs';
import path from 'path';

/** cap sync 只掃描 node_modules 插件，需手動補上 App 目標內的本地插件 */
const LOCAL_IOS_PLUGINS = ['InAppPurchasePlugin'];
const configPath = path.resolve('ios/App/App/capacitor.config.json');

const cap = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const list = new Set(cap.packageClassList ?? []);
for (const plugin of LOCAL_IOS_PLUGINS) {
  list.add(plugin);
}
cap.packageClassList = [...list];
fs.writeFileSync(configPath, `${JSON.stringify(cap, null, '\t')}\n`);

// Xcode 26 支援的 iOS deployment target 下限為 15；Capacitor 6 產生的
// Cordova podspec 仍預設 13，因此每次 cap sync 後一併修正。
const cordovaPodspecs = [
  'ios/capacitor-cordova-ios-plugins/CordovaPlugins.podspec',
  'ios/capacitor-cordova-ios-plugins/CordovaPluginsStatic.podspec',
];
for (const podspecPath of cordovaPodspecs) {
  const absolutePath = path.resolve(podspecPath);
  if (!fs.existsSync(absolutePath)) continue;
  const source = fs.readFileSync(absolutePath, 'utf8');
  const patched = source.replace(
    /s\.ios\.deployment_target\s*=\s*'[^']+'/,
    "s.ios.deployment_target  = '15.0'"
  );
  fs.writeFileSync(absolutePath, patched);
}
