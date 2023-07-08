module.exports = require('@battis/webpack/ts/spa')({
  root: __dirname,
  appName: 'Blackbaud-to-Google Group Sync',
  entry: './src/client/index.ts',
  template: 'template',
  build: 'public'
});
