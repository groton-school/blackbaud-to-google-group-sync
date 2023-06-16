import { confirm } from '@inquirer/prompts';
import open from 'open';
import cli from '../lib/cli.js';

export default async function guideAuthorizeApp({ url }) {
  await open(url);
  await confirm({
    message: `Confirm that you have authorized the app at ${cli.url(url)}`
  });
}
