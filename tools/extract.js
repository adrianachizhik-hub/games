// pull the two inline scripts out of an html file
const fs = require('fs');
module.exports = function (file) {
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
};
