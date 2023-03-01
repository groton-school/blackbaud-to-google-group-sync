const config = require('@battis/webpack-typescript-spa');

module.exports = config({
  root: __dirname,
  name: 'Daily Schedule',
  entry: './src/client/index.ts',
  template: 'template',
  build: 'public',
});
