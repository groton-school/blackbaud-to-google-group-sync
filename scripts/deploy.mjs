import gcloud from '@battis/partly-gcloudy';
import { Colors } from '@battis/qui-cli.colors';
import { Core } from '@battis/qui-cli.core';
import { Env } from '@battis/qui-cli.env';
import { Log } from '@battis/qui-cli.log';
import * as Plugin from '@battis/qui-cli.plugin';
import { Root } from '@battis/qui-cli.root';
import { Validators } from '@battis/qui-cli.validators';
import { confirm, input } from '@inquirer/prompts';
import fs from 'node:fs';
import path from 'node:path';

let setup = false;
let name = 'Blackbaud-to-Google Group Sync';
let billing = undefined;
let region = undefined;
let supportEmail = undefined;
let delegatedAdmin = undefined;
let users = undefined;
let accessKey = undefined;
let clientId = undefined;
let clientSecret = undefined;
let scheduleName = 'daily-blackbaud-to-google-group-sync';
let scheduleCron = '0 1 * * *';

function configure(config = {}) {
  setup = Plugin.hydrate(config.force, !process.env.PROJECT);
  name = Plugin.hydrate(config.name, name);
  billing = Plugin.hydrate(config.billing, billing);
  region = Plugin.hydrate(config.region, region);
  supportEmail = Plugin.hydrate(config.supportEmail, supportEmail);
  delegatedAdmin = Plugin.hydrate(config.delegatedAdmin, delegatedAdmin);
  users = Plugin.hydrate(config.users, users);
  accessKey = Plugin.hydrate(config.accessKey, accessKey);
  clientId = Plugin.hydrate(config.clientId, clientId);
  clientSecret = Plugin.hydrate(config.clientSecret, clientSecret);
  scheduleName = Plugin.hydrate(config.scheduleName, scheduleName);
  scheduleCron = Plugin.hydrate(config.scheduleCron, scheduleCron);
}

function options() {
  return {
    opt: {
      name: {
        description: 'Google Cloud project name',
        default: name
      },
      billing: {
        description: 'Google Cloud billing account ID for this project'
      },
      region: {
        description:
          'Google Cloud region in which to create App Engine instance'
      },
      supportEmail: {
        description: 'Support email address for app OAuth consent screen'
      },
      delegatedAdmin: {
        description:
          'Google Workspace admin account that will delegate access to Admin SDK API'
      },
      users: {
        description:
          'Google IDs of users allowed to access app (comma-separated)'
      },
      accessKey: {
        description: 'Blackbaud SKY API subscription access key',
        url: 'https://developer.blackbaud.com/subscriptions'
      },
      clientId: {
        description: 'Blackbaud SKY API app OAuth client ID',
        url: 'https://developer.blackbaud.com/apps'
      },
      clientSecret: {
        description: 'Blackbaud SKY API app OAuth client secret'
      },
      scheduleName: {
        description: 'Google Cloud Scheduler task name for automatic sync',
        default: scheduleName
      },
      scheduleCron: {
        description:
          'Google Cloud Scheduler crontab definition for automatic sync',
        default: scheduleCron
      }
    },
    flag: {
      force: {
        description: `Force run initial setup script (normally skipped if ${Colors.url('.env')} is configured)`,
        short: 'f'
      }
    }
  };
}

async function guideGoogleWorkspaceAdminDelegation({ email, uniqueId }) {
  await confirm({
    message: `The Service Account Unique ID is ${Colors.value(uniqueId)}
Confirm that ${Colors.value(email)} has followed the directions at ${Colors.url(
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md'
    )}`
  });
}

async function guideBlackbaudAppCreation({
  hostname,
  accessKey = undefined,
  clientId = undefined,
  clientSecret = undefined
}) {
  accessKey = await input({
    message: `${options().opt.accessKey.description} from ${Colors.url(
      'https://developer.blackbaud.com/subscriptions'
    )}`,
    validate: Validators.notEmpty,
    default: accessKey
  });
  await confirm({
    message: `Create a new app at ${Colors.url('https://developer.blackbaud.com/apps')}`
  });
  clientId = await input({
    message: options().opt.clientId.description,
    validate: Validators.notEmpty,
    default: clientId
  });
  clientSecret = await input({
    message: options().opt.clientSecret.description,
    validate: Validators.notEmpty,
    default: clientSecret
  });
  const redirectUrl = `https://${hostname}/redirect`;
  await confirm({
    message: `Configure ${Colors.value(redirectUrl)} as the app's redirect URL`
  });
  await confirm({
    message: `Limit the SKY API scopes as described at ${Colors.url(
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/blackbaud-api-scope.md'
    )}`
  });
  return { accessKey, clientId, clientSecret, redirectUrl };
}

function init(args) {
  configure(args.values);
}

async function run() {
  const { appEngine, project } = await gcloud.batch.appEngineDeployAndCleanup({
    retainVersions: 2
  });
  if (setup) {
    // define a Google Workspace admin who will delegate their access to the Admin SDK API to manage Google Groups
    delegatedAdmin =
      delegatedAdmin ||
      (await input({
        message:
          'Google Workspace admin who is delegating access to the Admin SDK',
        validate: Validators.email
      }));
    await gcloud.iam.addPolicyBinding({
      user: delegatedAdmin,
      role: gcloud.iam.Roles.Owner
    });
    const delegate = await gcloud.iam.createServiceAccount({
      displayName: 'Google Workspace Admin Delegate',
      name: project.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/--+/g, '-')
    });
    const credentialsPath = path.join(
      Root.path(),
      `.cache/${delegate.uniqueId}.json`
    );
    await gcloud.iam.getServiceAccountCredentials({
      email: path.basename(delegate.name),
      path: credentialsPath
    });
    await gcloud.services.enable({ service: gcloud.services.API.AdminSDKAPI });
    await guideGoogleWorkspaceAdminDelegation({
      email: path.basename(delegate.name),
      uniqueId: delegate.uniqueId
    });

    // enable IAP to limit access to app
    await gcloud.iap.enable({
      applicationTitle: project.name,
      supportEmail,
      users,
      project
    });

    await gcloud.secrets.enableAppEngineAccess();
    const blackbaud = await guideBlackbaudAppCreation({
      hostname: appEngine.defaultHostname,
      accessKey,
      clientId,
      clientSecret
    });
    await gcloud.secrets.set({
      name: 'BLACKBAUD_ACCESS_KEY',
      value: blackbaud.accessKey
    });
    await gcloud.secrets.set({ name: 'BLACKBAUD_API_TOKEN', value: 'null' });
    await gcloud.secrets.set({
      name: 'BLACKBAUD_CLIENT_ID',
      value: blackbaud.clientId
    });
    await gcloud.secrets.set({
      name: 'BLACKBAUD_CLIENT_SECRET',
      value: blackbaud.clientSecret
    });
    await gcloud.secrets.set({
      name: 'BLACKBAUD_REDIRECT_URL',
      value: blackbaud.redirectUrl
    });
    await gcloud.secrets.set({
      name: 'GOOGLE_DELEGATED_ADMIN',
      value: delegatedAdmin
    });
    await gcloud.secrets.set({
      name: 'GOOGLE_CREDENTIALS',
      path: credentialsPath
    });
    fs.unlinkSync(credentialsPath);
    await gcloud.secrets.enableAppEngineAccess();

    // schedule recurring job
    await gcloud.scheduler.setAppEngineJob({
      name: scheduleName,
      cron: scheduleCron,
      location: appEngine.locationId,
      relativeUrl: '/sync'
    });

    Log.info(
      `Visit ${Colors.url(`https://${appEngine.defaultHostname}`)} to authorize ${name} to access Blackbaud APIs`
    );
  }
}

Root.configure({ root: path.dirname(import.meta.dirname) });
Env.configure();
await Plugin.register({
  name: 'deploy',
  src: path.resolve(path.dirname(import.meta.dirname), 'src'),
  options,
  init,
  run
});
await Core.run();
