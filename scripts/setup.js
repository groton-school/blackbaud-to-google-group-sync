#!/usr/bin/env node
import createAppEngineInstance from './actions/createAppEngineInstance.js';
import createProject from './actions/createProject.js';
import enableBilling from './actions/enableBilling.js';
import enableIdentityAwareProxy from './actions/enableIdentityAwareProxy.js';
import guideAuthorizeApp from './actions/guideAuthorizeApp.js';
import guideBlackbaudAppCreation from './actions/guideBlackbaudAppCreation.js';
import guideGoogleWorkspaceAdminDelegation from './actions/guideWorkspaceAdminDelegation.js';
import initializeProject from './actions/initializeProject.js';
import initializeSecretManager from './actions/initializeSecretManager.js';
import scheduleSync from './actions/scheduleSync.js';
import verifyExternalDependencies from './actions/verifyExternalDependencies.js';
import cli from './lib/cli.js';
import { parseArguments } from './lib/options.js';

(async () => {
  const args = await parseArguments();
  cli.setCWDtoProjectRoot();

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
    cli.exec(`npm run build`);
  }
  if (!args.deployed) {
    cli.exec(`npm run deploy`);
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
