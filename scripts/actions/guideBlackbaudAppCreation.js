import { confirm, input } from '@inquirer/prompts';
import open from 'open';
import cli from '../lib/cli.js';
import { options } from '../lib/options.js';
import validators from '../lib/validators.js';

export default async function guideBlackbaudAppCreation({
  url,
  accessKey = undefined,
  clientId = undefined,
  clientSecret = undefined
}) {
  !accessKey && open(options.accessKey.url);
  accessKey = await input({
    message: `${options.accessKey.description} from ${cli.url(
      options.accessKey.url
    )}`,
    validate: validators.nonEmpty,
    default: accessKey
  });
  !clientId && open(options.clientId.url);
  cli.log(`Create a new app at ${cli.url(options.clientId.url)}`);
  clientId = await input({
    message: options.clientId.description,
    validate: validators.nonEmpty,
    default: clientId
  });
  clientSecret = await input({
    message: options.clientSecret.description,
    validate: validators.nonEmpty,
    default: clientSecret
  });
  const redirectUrl = `${url}/redirect`;
  await confirm({
    message: `Configure ${cli.value(redirectUrl)} as the app's redirect URL`
  });
  const scope =
    'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/blackbaud-api-scope.md';
  open(scope);
  await confirm({
    message: `Limit the SKY API scopes as described at ${cli.url(scope)}`
  });
  return { accessKey, clientId, clientSecret, redirectUrl };
}
