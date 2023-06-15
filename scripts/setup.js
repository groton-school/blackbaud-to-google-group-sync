#!/usr/bin/env node
// @ts-nocheck (because it _really_ doesn't like CancelablePromise)
import { confirm, input, select } from '@inquirer/prompts';
import dotenv from 'dotenv';
import fs from 'fs';
import { jack } from 'jackspeak';
import open from 'open';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import gcloud from './gcloud.js';
import lib from './lib.js';
import options from './options.js';
import validators from './validators.js';

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
      },
      delegated: {
        short: 'g',
        description:
          'Google Workspace admin has already delegated access to Admin SDK API'
      },
      built: {
        short: 'b',
        description: 'App build is current, does not need to be recompiled'
      },
      deployed: {
        short: 'd',
        description: 'Deployent to App Engine is current, no need to redeploy'
      }
    })
    .opt(options);
  const { values } = j.parse();
  if (values.help) {
    lib.log(j.usage());
    process.exit(0);
  }
  return values;
}

async function initializeProject({ projectName, projectId = undefined }) {
  projectName = await input({
    message: options.name.description,
    validate: validators.maxLength.bind(null, 30),
    default: projectName
  });
  gcloud.setProjectId(
    await input({
      message: options.project.description,
      validate: validators.maxLength.bind(null, 30),
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
  delegatedAdmin = undefined,
  delegated = false
}) {
  delegatedAdmin = await input({
    message: options.delegatedAdmin.description,
    validate: validators.email,
    default: delegatedAdmin
  });
  gcloud.invoke(
    `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${delegatedAdmin}" --role="roles/owner"`,
    false
  );
  gcloud.invoke('services enable admin.googleapis.com');
  const name = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/--/g, '-');
  let serviceAccount = gcloud.invoke(
    `iam service-accounts list --filter=email=${name}@${gcloud.getProjectId()}.iam.gserviceaccount.com`
  )[0];
  if (!serviceAccount) {
    serviceAccount = gcloud.invoke(
      `iam service-accounts create ${name} --display-name="Google Delegated Admin"`
    );
  }
  /*
   * FIXME use Workload Identity Federation
   *  Service account keys could pose a security risk if compromised. We
   *  recommend you avoid downloading service account keys and instead use the
   *  Workload Identity Federation . You can learn more about the best way to
   *  authenticate service accounts on Google Cloud here.
   *  https://cloud.google.com/iam/docs/workload-identity-federation
   *  https://cloud.google.com/blog/products/identity-security/how-to-authenticate-service-accounts-to-help-keep-applications-secure
   */
  /*
   * FIXME max 10 keys available
   *  Need to delete one to create one
   */
  const credentialsPath = `.cache/${serviceAccount.uniqueId}.json`;
  gcloud.invoke(
    `iam service-accounts keys create ${credentialsPath} --iam-account=${serviceAccount.email}`
  );
  if (!delegated) {
    const url =
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md';
    open(url);
    await confirm({
      message: `The Service Account Unique ID is ${lib.value(
        serviceAccount.uniqueId
      )}
Confirm that ${lib.value(
        delegatedAdmin
      )} has followed the directions at ${lib.url(url)}`
    });
  }

  return { delegatedAdmin, credentialsPath };
}

async function createAppEngineInstance({ region = undefined }) {
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

async function enableIdentityAwareProxy({
  projectName,
  supportEmail = undefined,
  users = undefined
}) {
  gcloud.invoke(`services enable iap.googleapis.com`);
  supportEmail =
    supportEmail ||
    (await input({
      message: options.supportEmail.description,
      validate: validators.email
    }));
  const project = gcloud.invoke(
    `projects list --filter=projectId=${gcloud.getProjectId()}`,
    false
  )[0];
  let brand = gcloud.invoke(
    `iap oauth-brands list --filter=name=projects/${project.projectNumber}/brands/${project.projectNumber}`
  );
  brand = brand && brand.length && brand[0];
  if (!brand) {
    brand = gcloud.invoke(
      `iap oauth-brands create --application_title="${projectName}" --support_email=${supportEmail}`
    ).name;
  }
  let oauth = gcloud.invoke(`iap oauth-clients list ${brand.name}`);
  oauth = oauth && oauth.length && oauth[0];
  if (!oauth) {
    oauth = gcloud.invoke(
      `iap oauth-clients create ${brand} --display_name=IAP-App-Engine-app`
    );
  }
  gcloud.invoke(
    `iap web enable --resource-type=app-engine --oauth2-client-id=${path.basename(
      oauth.name
    )} --oauth2-client-secret=${oauth.secret}`
  );
  users = (
    await input({
      message: options.users.description,
      validate: (value) =>
        value
          .split(',')
          .map((val) => val.trim())
          .reduce(
            (cond, val) =>
              cond && validators.nonEmpty(val) && validators.email(val),
            true
          ) || 'all entries must be email addresses',
      default: users
    })
  )
    .split(',')
    .map((value) => value.trim());
  users.forEach((user) =>
    gcloud.invoke(
      `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${user}" --role="roles/iap.httpsResourceAccessor"`,
      false
    )
  );
}

async function guideBlackbaudAppCreation({
  url,
  accessKey = undefined,
  clientId = undefined,
  clientSecret = undefined
}) {
  !accessKey && options.accessKey.url;
  accessKey = await input({
    message: `${options.accessKey.description} from ${lib.url(
      options.accessKey.url
    )}`,
    validate: validators.nonEmpty,
    default: accessKey
  });
  !clientId && open(options.clientId.url);
  lib.log(`Create a new app at ${lib.url(options.clientId.url)}`);
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
    message: `Configure ${lib.value(redirectUrl)} as the app's redirect URL`
  });
  const scope =
    'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/blackbaud-api-scope.md';
  open(scope);
  await confirm({
    message: `Limit the SKY API scopes as described at ${lib.url(scope)}`
  });
  return { accessKey, clientId, clientSecret, redirectUrl };
}

async function initializeSecretManager({
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
        lib.exec(
          `echo "${values[key]
          }" | gcloud secrets versions add ${secret} --data-file=- ${gcloud.getFlagsWithProject()}`
        );
      }
    } else {
      if (key === 'GOOGLE_CREDENTIALS') {
        gcloud.invoke(`secrets create ${key} --data-file="${values[key]}"`);
      } else {
        lib.exec(
          `echo "${values[key]
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

async function guideAuthorizeApp({ url }) {
  await open(url);
  await confirm({
    message: `Confirm that you have authorized the app at ${lib.url(url)}`
  });
}

async function scheduleSync({ scheduleName, scheduleCron, location }) {
  gcloud.invoke(`services enable cloudscheduler.googleapis.com`);

  let schedule = gcloud.invoke(
    `scheduler jobs list --filter=appEngineHttpTarget.relativeUri=/sync --location=${location}`
  );
  schedule = schedule && schedule.length && schedule[0];
  if (schedule) {
    gcloud.invoke(
      `scheduler jobs update app-engine ${schedule.name} --schedule="${scheduleCron}"`
    );
  } else {
    gcloud.invoke(
      `scheduler jobs create app-engine ${scheduleName} --schedule="${scheduleCron}" --relative-url="/sync"`
    );
  }
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
  const googleWorkspace = await guideGoogleWorkspaceAdminDelegation({
    projectName,
    delegatedAdmin: args.delegatedAdmin,
    delegated: args.delegated
  });
  const app = await createAppEngineInstance({
    region: args.region
  });
  const url = `https://${app.defaultHostname}`;

  // must create an instance so that IAP can be configured
  if (!args.built) {
    lib.exec(`npm run build`);
  }
  if (!args.deployed) {
    lib.exec(`npm run deploy`);
  }

  await enableIdentityAwareProxy({
    projectName,
    supportEmail: args.supportEmail,
    users: args.users
  });
  const blackbaud = await guideBlackbaudAppCreation({
    url,
    accessKey: args.accessKey,
    clientId: args.clientId,
    clientSecret: args.clientSecret
  });
  await initializeSecretManager({
    blackbaud,
    googleWorkspace,
    serviceAccount: app.serviceAccount
  });
  await guideAuthorizeApp({ url });
  await scheduleSync({
    scheduleName: args.scheduleName,
    scheduleCron: args.scheduleCron,
    location: app.locationId
  });
})();
