// Bundles src/index.html + src/styles/*.css + src/js/**/*.js into one standalone page: public/index.html
// No framework. The JS files share one scope (one IIFE) and are joined in the order listed here.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), src = p => fs.readFileSync(path.join(root, 'src', p), 'utf8').trim();

const CSS = ['base', 'layout', 'components', 'invoice-sheet'].map(n => `styles/${n}.css`);
const JS = ['util', 'qr', 'calc', 'data', 'storage', 'router', 'auth',
  'routes/invoices', 'routes/customers', 'routes/inventory', 'routes/purchases', 'routes/item', 'routes/analytics', 'routes/settings', 'routes/users', 'routes/stores', 'pdf', 'main'].map(n => `js/${n}.js`);

function bundle() {
  const shell = src('index.html');
  const m = shell.match(/<title>([\s\S]*?)<\/title>/);
  const title = m ? m[1] : 'Jewellery Billing';
  const css = CSS.map(src).join('\n');
  const js = "(function(){\n'use strict';\n" + JS.map(src).join('\n') + '\n})();';
  const body = shell.replace(/<title>[\s\S]*?<\/title>/, '').replace('<!-- SCRIPTS -->',
    () => '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n<script>\n' + js + '\n</script>'); // function form: JS contains "$$"/"$&" which replace() would expand
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;
  return { html, js, css };
}
module.exports = { bundle };
if (require.main === module) {
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'index.html'), bundle().html);
  console.log('Built public/index.html');
}
