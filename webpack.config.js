const config = require('@battis/webpack-typescript-spa');

module.exports = config({
  root: __dirname,
  appName: 'Blackbaud to Google Groups Sync',
  entry: './src/client/index.ts',
  template: 'template',
  build: 'public',
});
