const config = require('@battis/webpack/ts/spa');

module.exports = config({
  root: __dirname,
  appName: 'Blackbaud-to-Google Group Sync',
  entry: './src/client/index.ts',
  template: 'template',
  build: 'public'
});
