/**
 * Loads the browser game modules into Node so logic can be tested without a DOM.
 * The modules attach themselves to `window.BF`; here `window` is the global object.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LOGIC_FILES = [
  'config.js', 'utils.js', 'outcome.js', 'rules.js', 'skins.js', 'progress.js', 'rewards.js', 'wallet.js', 'round.js', 'balloon.js',
];

function loadGame() {
  if (globalThis.BF) return globalThis.BF;
  globalThis.window = globalThis;
  for (const file of LOGIC_FILES) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInThisContext(src, { filename: file });
  }
  return globalThis.BF;
}

module.exports = { loadGame };
