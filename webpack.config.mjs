import bundle from '@battis/webpack';
import webpack from 'webpack';

export default bundle.fromTS.toSPA({
  root: import.meta.dirname,
  appName: 'Blackbaud-to-Google Group Sync',
  entry: './src/client/index.ts',
  template: 'template',
  output: { path: 'public' },
  production: true,
  plugins: [
    new webpack.DefinePlugin({
      PROJECT: JSON.stringify(process.env.PROJECT),
      URL: JSON.stringify(process.env.URL)
    })
  ]
});
