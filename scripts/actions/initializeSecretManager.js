import fs from 'fs';
import path from 'path';
import cli from '../lib/cli.js';
import gcloud from '../lib/gcloud.js';

export default async function initializeSecretManager({
  blackbaud,
  googleWorkspace,
  serviceAccount
}) {
  gcloud.invoke(`services enable secretmanager.googleapis.com`);
  const secrets = Array.from(gcloud.invoke('secrets list'));
  const values = {
    BLACKBAUD_ACCESS_KEY: blackbaud.accessKey,
    BLACKBAUD_API_TOKEN: 'null',
    BLACKBAUD_CLIENT_ID: blackbaud.clientId,
    BLACKBAUD_CLIENT_SECRET: blackbaud.clientSecret,
    BLACKBAUD_REDIRECT_URL: blackbaud.redirectUrl,
    GOOGLE_DELEGATED_ADMIN: googleWorkspace.delegatedAdmin,
    GOOGLE_CREDENTIALS: googleWorkspace.credentialsPath
  };
  for (const key in values) {
    const secret = secrets.reduce((result, secret) => {
      if (path.basename(secret.name) === key) {
        return secret.name;
      }
      return result;
    }, undefined);
    if (secret) {
      if (key === 'GOOGLE_CREDENTIALS') {
        gcloud.invoke(
          `secrets versions add ${secret} --data-file="${values[key]}"`
        );
      } else {
        cli.exec(
          `printf "${values[key]
          }" | gcloud secrets versions add ${secret} --data-file=- ${gcloud.getFlagsWithProject()}`
        );
      }
    } else {
      if (key === 'GOOGLE_CREDENTIALS') {
        gcloud.invoke(`secrets create ${key} --data-file="${values[key]}"`);
      } else {
        cli.exec(
          `printf "${values[key]
          }" | gcloud secrets create ${key} --data-file=- ${gcloud.getFlagsWithProject()}`
        );
      }
    }
  }

  fs.unlinkSync(googleWorkspace.credentialsPath);

  gcloud.invoke(
    `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="serviceAccount:${serviceAccount}" --role="roles/secretmanager.secretAccessor"`,
    false
  );
}
