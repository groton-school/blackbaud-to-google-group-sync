import bundle from '@battis/webpack';

export default bundle.fromTS.toSPA({
  root: import.meta.dirname,
  appName: 'Blackbaud-to-Google Group Sync',
  entry: './src/client/index.ts',
  template: 'template',
  output: { path: 'public' },
  production: true
});
