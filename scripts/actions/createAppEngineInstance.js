import { select } from '@inquirer/prompts';
import fs from 'fs';
import gcloud from '../lib/gcloud.js';
import { options } from '../lib/options.js';

export default async function createAppEngineInstance({ region = undefined }) {
  gcloud.invoke('services enable appengine.googleapis.com');
  let app = gcloud.invoke('app describe');
  if (typeof instance === 'string') {
    region =
      region ||
      (await select({
        message: options.region.description,
        choices: gcloud
          .invoke(`app regions list`)
          .map((region) => ({ value: region.region }))
      }));
    gcloud.invoke(`app create --region=${region}`);
    app = gcloud.invoke('app describe');
  }

  const url = `https://${app.defaultHostname}`;
  fs.writeFileSync(
    '.env',
    `PROJECT=${gcloud.getProjectId()}
URL=${url}`
  );

  return app;
}
