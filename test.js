const fs = require('fs');
// Let's just mock what we need
const js = fs.readFileSync('game.js', 'utf-8');
// See if there's any syntax error or runtime error evaluating Plant
try {
  let board_x = 240, cell_size = 80;
  // Does js have any syntax error?
  const script = require('vm').createScript(js);
  console.log("Syntax is valid");
} catch(e) {
  console.error("Syntax error", e);
}
