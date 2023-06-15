#!/usr/bin/env node
// @ts-nocheck (because it _really_ doesn't like CancelablePromise)
import { confirm, input, select } from '@inquirer/prompts';
import dotenv from 'dotenv';
import email from 'email-validator';
import fs from 'fs';
import { jack } from 'jackspeak';
import open from 'open';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import gcloud from './gcloud.js';
import lib from './lib.js';

const nonEmptyValidator = (value) =>
  (value && value.length > 0) || 'May not be empty';
const maxLengthValidator = (maxLength, value) =>
  (nonEmptyValidator(value) && value && value.length <= maxLength) ||
  `Must be ${maxLength} characters or fewer`;
const emailValidator = (value) =>
  (nonEmptyValidator(value) && email.validate(value)) ||
  'Must be a valid mail address';

async function verifyExternalDependencies() {
  lib.versionTest({
    name: 'npm',
    download: 'https://nodejs.org/'
  });
  lib.versionTest({
    name: 'gcloud',
    download: 'https://cloud.google.com/sdk/docs/install'
  });
}

async function parseArguments() {
  const j = jack({ envPrefix: 'ARG' })
    .flag({
      help: {
        short: 'h'
      }
    })
    .opt({
      project: {
        short: 'p',
        description: 'Google Cloud project unique identifier'
      },
      name: {
        short: 'n',
        description: 'Google Cloud project name',
        default: 'Blackbaud-to-Google Group Sync'
      },
      billing: {
        short: 'b',
        description: 'Google Cloud billing account ID for this project'
      },
      delegatedAdmin: {
        short: 'a',
        description:
          'Google Workspace admin account that will delegate access to Admin SDK API'
      },
      region: {
        short: 'r',
        description:
          'Google Cloud region in which to create App Engine instance'
      },
      supportEmail: {
        short: 'e',
        description: 'Support email address for app OAuth consent screen'
      },
      scheduleName: {
        short: 's',
        description: 'Google Cloud Scheduler task name for automatic sync',
        default: 'daily-blackbaud-to-google-group-sync'
      },
      scheduleCron: {
        short: 'c',
        description:
          'Google Cloud Scheduler crontab definition for automatic sync',
        default: '0 1 * * *'
      }
    })
    .optList({
      user: {
        short: 'u',
        description: 'Google ID of user who can access the app through IAP',
        delim: ',',
        default: []
      }
    });
  const { values } = await j.parse();
  if (values.help) {
    lib.log(j.usage());
    process.exit(0);
  }
  return values;
}

async function initializeProject({ projectName, projectId = undefined }) {
  projectName = await input({
    message: 'Google Cloud project name',
    validate: maxLengthValidator.bind(null, 30),
    default: projectName
  });
  gcloud.setProjectId(
    await input({
      message: 'Google Cloud project ID',
      validate: maxLengthValidator.bind(null, 30),
      default: projectId || gcloud.getProjectId()
    })
  );
  return projectName;
}

async function createProject({ projectName }) {
  const [project] = gcloud.invoke(
    `projects list --filter=projectId=${gcloud.getProjectId()}`
  );
  if (project) {
    if (
      !(await confirm({
        message: `(Re)configure existing project ${lib.value(
          project.projectId
        )}?`
      }))
    ) {
      throw new Error('must create or reuse project');
    }
  } else {
    let response = gcloud.invoke(
      `projects create --name="${projectName}" ${gcloud.getProjectId()}`,
      false
    );
    if (/error/i.test(response)) {
      throw new Error(response);
    }
  }
}

async function enableBilling({ accountId = undefined }) {
  // TODO check if accountId arg exists/is open
  if (!accountId) {
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
      (await confirm({
        message: `Use billing account ${lib.value(choices[0].name)}?`
      }))
    ) {
      accountId = choices[0].value;
    }
  }

  if (accountId) {
    gcloud.invokeBeta(
      `billing projects link ${gcloud.getProjectId()} --billing-account="${accountId}"`,
      false
    );
  } else {
    await open(
      `https://console.cloud.google.com/billing/?project=${gcloud.getProjectId()}`
    );
    await confirm({
      message:
        'Confirm that you have created a billing account for this project'
    });
  }
}

async function guideGoogleWorkspaceAdminDelegation({
  projectName,
  delegatedAdmin = undefined
}) {
  delegatedAdmin = await input({
    message:
      'Enter the Google ID for a Workspace Admin who will delegate authority for this app',
    validate: emailValidator,
    default: delegatedAdmin
  });
  gcloud.invoke(
    `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${delegatedAdmin}" --role="roles/owner"`,
    false
  );
  gcloud.invoke(`services enable admin.googleapis.com`);
  const serviceAccount = gcloud.invoke(
    `iam service-accounts create ${projectName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/--/g, '-')} --display-name="Google Delegated Admin"`
  );
  const credentialsPath = `${serviceAccount.uniqueId}.json`;
  gcloud.invoke(
    `iam service-accounts keys create ${credentialsPath} --iam-account=${serviceAccount.email}`
  );
  const url =
    'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md';
  open(url);
  await confirm({
    message: `The Service Account Unique ID is ${lib.value(
      serviceAccount.uniqueId
    )}
Confirm that ${lib.value(
      delegatedAdmin
    )} has followed the directions at ${lib.value(url)}`
  });

  return { delegatedAdmin, credentialsPath };
}

async function createAppEngineInstance({ region = undefined }) {
  // gcloud.invoke(`services enable appengine.googleapis.com`);
  region =
    region ||
    (await select({
      message: 'Select a region for the app engine instance',
      choices: gcloud
        .invoke(`app regions list`)
        .map((region) => ({ value: region.region }))
    }));
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

async function enableIdentityAwareProxy({
  projectName,
  supportEmail = undefined,
  users = []
}) {
  gcloud.invoke(`services enable iap.googleapis.com`);
  supportEmail =
    supportEmail ||
    (await input({
      message: 'Enter a support email address for the app',
      validate: emailValidator
    }));
  const brand = gcloud.invoke(
    `iap oauth-brands create --application_title${projectName} --support_email=${supportEmail}`
  ).name;
  const oauth = gcloud.invoke(
    `iap oauth-clients create ${brand} --display_name=IAP-App-Engine-app`
  );
  gcloud.invoke(
    `iap web enable --resource-type=app-engine --oauth2-client-id=${path.basename(
      oauth.name
    )} --oauth2-client-secret=${oauth.secret}`
  );
  if (users.length === 0) {
    let done = false;
    do {
      const user = await input({
        message:
          'Email address of user who can access the app interface (blank to end)',
        validate: (u) => nonEmptyValidator(u) !== true || emailValidator(u)
      });
      if (nonEmptyValidator(user)) {
        users.push(user);
      } else {
        done = true;
      }
    } while (!done);
  } else {
    const nonEmail = users.filter((user) => !emailValidator(user));
    if (nonEmail.length) {
      const plural = nonEmail.length > 1;
      lib.log(
        `${lib.value(nonEmail.join(', '))} ${plural ? 'are not' : 'is not a'
        } valid email address${plural ? 'es' : ''
        } and will not be assigned to IAP`
      );
    }
  }
  users.forEach((user) =>
    gcloud.invoke(
      `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${user}" --role="roles/iap.httpsResourceAccessor"`,
      false
    )
  );
}

async function guideBlackbaudAppCreation({ url }) {
  const accessKey = await input({
    message:
      'Enter a subscription access key from https://developer.blackbaud.com/subscriptions',
    validate: nonEmptyValidator
  });
  lib.log('Create a new app at https://developer.blackbaud.com/apps');
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
    message: `Configure ${lib.value(redirectUrl)} as the app's redirect URL`
  });
  // TODO directions for limiting scope of app
  return { accessKey, clientId, clientSecret, redirectUrl };
}

async function initializeSecretManager({ blackbaud, googleWorkspace }) {
  gcloud.invoke(`services enable secretmanager.googleapis.com`);
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

async function guideAuthorizeApp({ url }) {
  await open(url);
  await confirm({
    message: `Confirm that you have authorized the app at ${lib.value(url)}`
  });
}

async function scheduleSync({ scheduleName, scheduleCron }) {
  gcloud.invoke(`services enable cloudscheduler.googleapis.com`);
  gcloud.invoke(
    `scheduler jobs create app-engine ${scheduleName} --schedule="${scheduleCron}" --relative-url="/sync"`
  );
}

(async () => {
  const args = await parseArguments();

  process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  dotenv.config();

  await verifyExternalDependencies();
  const projectName = await initializeProject({
    projectId: args.project,
    projectName: args.name
  });
  await createProject({ projectName });
  await enableBilling({ accountId: args.billing });
  const googleWorkspace = guideGoogleWorkspaceAdminDelegation({
    projectName,
    delegatedAdmin: args.delegatedAdmin
  });
  const url = await createAppEngineInstance({
    region: args.region
  });
  await enableIdentityAwareProxy({
    projectName,
    supportEmail: args.supportEmail,
    users: args.user
  });
  const blackbaud = await guideBlackbaudAppCreation({ url });
  await initializeSecretManager({ blackbaud, googleWorkspace });
  await guideAuthorizeApp({ url });
  await scheduleSync({
    scheduleName: args.scheduleName,
    scheduleCron: args.scheduleCron
  });
})();
