#!/usr/bin/env node
import options from './options.mjs';
import gcloud from '@battis/partly-gcloudy';
import cli from '@battis/qui-cli';
import fs from 'fs';
import path from 'path';

async function guideGoogleWorkspaceAdminDelegation({ email, uniqueId }) {
  await cli.prompts.confirm({
    message: `The Service Account Unique ID is ${cli.colors.value(uniqueId)}
Confirm that ${cli.colors.value(
      email
    )} has followed the directions at ${cli.colors.url(
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md'
    )}`
  });
}

async function guideBlackbaudAppCreation({
  url,
  accessKey = undefined,
  clientId = undefined,
  clientSecret = undefined
}) {
  accessKey = await cli.prompts.input({
    message: `${options.accessKey.description} from ${cli.colors.url(
      options.accessKey.url
    )}`,
    validate: cli.validators.notEmpty,
    default: accessKey
  });
  await cli.prompts.confirm({
    message: `Create a new app at ${cli.colors.url(options.clientId.url)}`
  });
  clientId = await cli.prompts.input({
    message: options.clientId.description,
    validate: cli.validators.notEmpty,
    default: clientId
  });
  clientSecret = await cli.prompts.input({
    message: options.clientSecret.description,
    validate: cli.validators.notEmpty,
    default: clientSecret
  });
  const redirectUrl = `${url}/redirect`;
  await cli.prompts.confirm({
    message: `Configure ${cli.colors.value(
      redirectUrl
    )} as the app's redirect URL`
  });
  await cli.prompts.confirm({
    message: `Limit the SKY API scopes as described at ${cli.colors.url(
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/blackbaud-api-scope.md'
    )}`
  });
  return { accessKey, clientId, clientSecret, redirectUrl };
}

(async () => {
  const args = await gcloud.init({
    args: {
      options,
      flags: {
        deploy: {
          description:
            'Include the (time-consuming) deploy step to App Engine (default true, --no-deploy to skip)'
        }
      }
    }
  });
  if (args.values.verbose) {
    cli.shell.setSilent(false);
  }

  if (gcloud.ready()) {
    const { project, appEngine } = await gcloud.batch.appEnginePublish({
      name: args.values.name,
      id: args.values.project,
      suggestedName: 'Blackbaud-to-Google Group Sync',
      billingAccountId: args.values.billing,
      region: args.values.region,
      env: { keys: { urlVar: 'URL' } },
      prebuild: () => {
        return true;
      },
      deploy: args.values.deploy
    });

    // define a Google Workspace admin who will delegate their access to the Admin SDK API to manage Google Groups
    args.values.delegatedAdmin =
      args.values.delegatedAdmin ||
      (await cli.prompts.input({
        message:
          'Google Workspace admin who is delegating access to the Admin SDK',
        validate: cli.validators.email
      }));
    await gcloud.iam.addPolicyBinding({
      user: args.values.delegatedAdmin,
      role: google.iam.Roles.Owner
    });
    const delegate = await gcloud.iam.createServiceAccount({
      displayName: 'Google Workspace Admin Delegate',
      name: project.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/--+/g, '-')
    });
    const credentialsPath = path.join(
      cli.appRoot(),
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

    // must create an instance so that IAP can be configured
    if (!args.values.built) {
      cli.shell.exec('npm run build');
    }
    if (!args.values.deployed) {
      cli.shell.exec('npm run deploy');
    }

    // enable IAP to limit access to app
    await gcloud.iap.enable({
      applicationTitle: project.name,
      supportEmail: args.values.supportEmail,
      users: args.values.users
    });

    // guide storage of Blackbaud credentials in Secret Manager, SKY App creation and configuration
    const blackbaud = await guideBlackbaudAppCreation({
      url,
      accessKey: args.values.accessKey,
      clientId: args.values.clientId,
      clientSecret: args.values.clientSecret
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
      value: args.values.delegatedAdmin
    });
    await gcloud.secrets.set({
      name: 'GOOGLE_CREDENTIALS',
      path: credentialsPath
    });
    fs.unlinkSync(credentialsPath);
    await gcloud.secrets.enableAppEngineAccess();

    // authorize the app to use Blackbaud SKY API manually
    await cli.prompts.confirm({
      message: `Confirm that you have authorized the app at ${cli.colors.url(
        url
      )}`
    });

    // schedule recurring job
    await gcloud.scheduler.setAppEngineJob({
      name: args.values.scheduleName,
      cron: args.values.scheduleCron,
      location: appEngine.locationId,
      relativeUrl: '/sync'
    });
  }
})();
