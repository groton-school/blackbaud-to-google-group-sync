#!/usr/bin/env node
import { confirm, input, select } from '@inquirer/prompts';
import dotenv from 'dotenv';
import emailValidator from 'email-validator';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import gcloud from './gcloud.js';
import lib from './lib.js';

const nonEmptyValidator = (val) => val && val.length > 0;

async function initializeApp() {
  let appName = 'Blackbaud-to-Google Group Sync';
  if (!(await confirm({ message: `Use '${appName}' as the app name?` }))) {
    appName = await input({
      message: 'App name',
      validate: (name) => nonEmptyValidator(name) && name.length <= 30
    });
  }
  if (
    !(await confirm({
      message: `Use '${gcloud.getProjectId()}' as project ID?`
    }))
  ) {
    gcloud.setProjectId(
      await input({
        message: 'Project ID',
        validate: (id) => nonEmptyValidator(id) && id.length <= 30
      })
    );
  }
  return appName;
}

async function installDependencies() {
  lib.versionTest({
    name: 'npm',
    download: 'https://nodejs.org/'
  });
  lib.versionTest({
    name: 'composer',
    download: 'https://getcomposer.org/'
  });
  lib.versionTest({
    name: 'gcloud',
    download: 'https://cloud.google.com/sdk/docs/install'
  });
  const pnpm = lib.versionTest({
    name: 'pnpm',
    dowload: 'https://pnpm.io/',
    fail: false
  });

  console.log(`Installing Node dependencies${pnpm ? ' (using pnpm)' : ''}`);
  lib.exec(`${pnpm ? 'pnpm' : 'npm'} install`);
  console.log('Installing PHP dependencies');
  lib.exec('composer install');
}

async function createProject(appName) {
  let response = gcloud.invoke(
    `projects create --name="${appName}" ${gcloud.getProjectId()}`,
    false
  );
  if (/error/i.test(response)) {
    throw new Error(response);
  }
}

async function enableBilling() {
  let accountId;
  const choices = gcloud
    .invokeBeta(`billing accounts list --filter=open=true`)
    .map((account) => ({
      name: account.displayName,
      value: path.basename(account.name)
    }));
  if (choices.length > 1) {
    accountId = await select({
      message: 'Select a billing account for this project',
      choices
    });
  } else if (
    choices.length === 1 &&
    (await confirm({ message: `Use ${choices[0].name} billing account?` }))
  ) {
    accountId = choices[0].value;
  }
  if (accountId) {
    gcloud.invokeBeta(
      `billing projects link ${gcloud.getProjectId()} --billing-account="${accountId}"`,
      false
    );
  } else {
    open(
      `https://console.cloud.google.com/billing/?project=${gcloud.getProjectId()}`
    );
    await confirm({
      message:
        'Confirm that you have created a billing account for this project'
    });
  }
}

async function enableAPIs() {
  gcloud.invoke(`services enable admin.googleapis.com`);
  gcloud.invoke(`services enable iap.googleapis.com`);
  gcloud.invoke(`services enable secretmanager.googleapis.com`);
  gcloud.invoke(`services enable cloudscheduler.googleapis.com`);
  gcloud.invoke(`services enable appengine.googleapis.com`);
}

async function guideGoogleWorkspaceAdminDelegation(appName) {
  const delegatedAdmin = await input({
    message:
      'Enter the Google ID for a Workspace Admin who will delegate authority for this app',
    validate: emailValidator
  });
  gcloud.invoke(
    `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${delegatedAdmin}" --role="roles/owner"`,
    false
  );

  const serviceAccount = gcloud.invoke(
    `iam service-accounts create ${appName
      .toLowerCase()
      .replace(/[^a-z]/g, '-')
      .replace(/--/g, '-')} --display-name="Google Delegated Admin"`
  );
  const credentialsPath = `${serviceAccount.uniqueId}.json`;
  gcloud.invoke(
    `iam service-accounts keys create ${credentialsPath} --iam-account=${serviceAccount.email}`
  );
  await confirm({
    message: `Confirm that ${delegatedAdmin} has followed the directions at https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md

  The Service Account Unique ID is ${serviceAccount.uniqueId}`
  });

  return { delegatedAdmin, credentialsPath };
}

async function createAppEngineInstance() {
  // FIXME give service account secrets-accessor role
  const region = await select({
    message: 'Select a region for the app engine instance',
    choices: gcloud
      .invoke(`app regions list`)
      .map((region) => ({ value: region.region }))
  });
  gcloud.invoke(`app create --region=${region}`);

  const url = `https://${gcloud.invoke(`app describe`).defaultHostname}`;
  fs.writeFileSync(
    '.env',
    `PROJECT=${gcloud.getProjectId()}
  URL=${url}`
  );

  // create default instance so IAP can be configured
  lib.exec(`npm run build`);
  lib.exec(`npm run deploy`);

  return url;
}

async function enableIdentityAwareProxy(appName) {
  const supportEmail = await input({
    message: 'Enter a support email address for the app',
    validate: emailValidator
  });
  const brand = gcloud.invoke(
    `iap oauth-brands create --application_title${appName} --support_email=${supportEmail}`
  ).name;
  const oauth = gcloud.invoke(
    `iap oauth-clients create ${brand} --display_name=IAP-App-Engine-app`
  );
  gcloud.invoke(
    `iap web enable --resource-type=app-engine --oauth2-client-id=${path.basename(
      oauth.name
    )} --oauth2-client-secret=${oauth.secret}`
  );
  const users = [];
  let done = false;
  do {
    const user = await input({
      message:
        'Email address of user who can access the app interface (blank to end)',
      validate: (u) => u.length === 0 || emailValidator(u)
    });
    if (nonEmptyValidator(user)) {
      users.push(user);
    } else {
      done = true;
    }
  } while (!done);
  users.forEach((user) =>
    gcloud.invoke(
      `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${user}" --role="roles/iap.httpsResourceAccessor"`,
      false
    )
  );
}

async function guideBlackbaudAppCreation(url) {
  const accessKey = await input({
    message:
      'Enter a subscription access key from https://developer.blackbaud.com/subscriptions',
    validate: nonEmptyValidator
  });
  console.log('Create a new app at https://developer.blackbaud.com/apps');
  const clientId = await input({
    message: "Enter the app's OAuth client ID",
    validate: nonEmptyValidator
  });
  const clientSecret = await input({
    message: "Enter one of the app's OAuth secrets",
    validate: nonEmptyValidator
  });
  const redirectUrl = `${url}/redirect`;
  await confirm({
    message: `Configure ${redirectUrl} as the app's redirect URL`
  });
  // TODO directions for limiting scope of app
  return { accessKey, clientId, clientSecret, redirectUrl };
}

async function initializeSecretManager({ blackbaud, googleWorkspace }) {
  gcloud.secrets.create('BLACKBAUD_ACCESS_KEY', blackbaud.accessKey);
  gcloud.secrets.create('BLACKBAUD_API_TOKEN', 'null');
  gcloud.secrets.create('BLACKBAUD_CLIENT_ID', blackbaud.clientId);
  gcloud.secrets.create('BLACKBAUD_CLIENT_SECRET', blackbaud.clientSecret);
  gcloud.secrets.create('BLACKBAUD_REDIRECT_URL', blackbaud.redirectUrl);
  gcloud.secrets.create(
    'GOOGLE_DELEGATED_ADMIN',
    googleWorkspace.delegatedAdmin
  );
  gcloud.secrets.create(
    'GOOGLE_CREDENTIALS',
    googleWorkspace.credentialsPath,
    true
  );
  fs.unlinkSync(googleWorkspace.credentialsPath);
}

async function guideAuthorizeApp(url) {
  await open(url);
  await confirm({
    message: `Confirm that you have authorized the app at ${url}`
  });
}

async function scheduleSync() {
  // TODO configurable schedule
  // TODO configurable job name
  gcloud.invoke(
    `scheduler jobs create app-engine daily-blackbaud-to-google-sync --schedule="0 1 * * *" --relative-url="/sync"`
  );
}

(async () => {
  // eslint-disable-next-line
  process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  dotenv.config();

  const appName = await initializeApp();
  await installDependencies();
  await createProject(appName);
  await enableBilling();
  await enableAPIs();
  const googleWorkspace = guideGoogleWorkspaceAdminDelegation(appName);
  const url = await createAppEngineInstance();
  await enableIdentityAwareProxy(appName);
  const blackbaud = await guideBlackbaudAppCreation(url);
  await initializeSecretManager({ blackbaud, googleWorkspace });
  await guideAuthorizeApp(url);
  await scheduleSync();
})();
