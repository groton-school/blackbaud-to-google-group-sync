(async () => {
  const process = require('process');
  const fs = require('fs');
  const child = require('child_process');
  const { rword } = require('rword');
  const path = require('path');
  const readline = require('readline/promises').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rword.load('big');
  function createProjectId() {
    const word1 = rword.generate(1, {
      length: 4 + Math.floor(Math.random() * 7)
    });
    const word2 = rword.generate(1, {
      length: 4 + Math.floor(Math.random() * (30 - 8 - word1.length - 4))
    });
    return `${word1}-${word2}-${Math.floor(99999 + Math.random() * 900001)}`;
  }

  const exec = (command) => child.execSync(command, { stdio: 'inherit' });

  function versionTest({
    name,
    download = undefined,
    command = undefined,
    fail = true
  }) {
    command = command || `${name} --version`;
    if (!/\d+\.\d/.test(child.execSync(command))) {
      if (fail) {
        console.error(
          `${name} is required${download ? `, install from ${download}` : ''}`
        );
        process.exit(1);
      } else {
        return false;
      }
    }
    return true;
  }

  // TODO configure project name
  const appName = 'Blackbaud-to-Google Group Sync';
  // TODO configure project ID
  const projectId = createProjectId();

  const flags = '--quiet --format=json';
  const flagsWithProject = `${flags} --project=${projectId}`;
  function gcloud(command, withProjectId = true) {
    let actualFlags = flagsWithProject;
    if (withProjectId === null) {
      actualFlags = '';
    } else if (actualFlags === false) {
      actualFlags = flags;
    }
    const result = child.execSync(`gcloud ${command} ${actualFlags} `);
    try {
      return JSON.parse(result);
    } catch (e) {
      return result;
    }
  }

  async function choiceFrom({ prompt, list, display, defaultChoice = 1 }) {
    switch (list.length) {
      case 0:
        throw new Error('empty list');
      case 1:
        defaultChoice = 1;
        break;
      default:
        if (defaultChoice > list.length) {
          defaultChoice = undefined;
        }
    }
    console.log(prompt);
    list.forEach((item, i) => console.log(`  ${i}. ${item[display]}`));

    let choice;
    let question = `(${defaultChoice > 1 ? 1 : '[1]'}-${defaultChoice < list.length ? `[${defaultChoice}]` : ''
      }-${defaultChoice === list.length ? `[${defaultChoice}]` : list.length})`;
    do {
      choice = await readline.question(question);
      if (choice.length) {
        choice = (parseInt(choice) || 0) - 1;
      } else {
        choice = defaultChoice - 1;
      }
    } while (choice < 0 || choice >= list.length);
    return list[choice];
  }

  async function nonEmpty({ prompt }) {
    let response;
    do {
      response = await readline.question(prompt);
    } while (response.length === 0);
    return response;
  }

  async function untilBlank({ prompt }) {
    const responses = [];
    let response;
    do {
      response = await readline.question(`${prompt} [<Enter> to end]`);
      if (response.length > 0) {
        responses.push(response);
      }
    } while (response.length > 0);
    return responses;
  }

  // set project root as cwd
  process.chdir(path.join(__dirname, '..'));

  // test for CLI dependencies
  versionTest({
    name: 'npm',
    download: 'https://nodejs.org/'
  });
  versionTest({
    name: 'composer',
    download: 'https://getcomposer.org/'
  });
  versionTest({
    name: 'gcloud',
    download: 'https://cloud.google.com/sdk/docs/install'
  });
  const pnpm = versionTest({
    name: 'pnpm',
    dowload: 'https://pnpm.io/',
    fail: false
  });

  // install dependencies
  exec(`${pnpm ? 'pnpm' : 'npm'} install`);
  exec('composer install');

  // create a new project
  let response = gcloud(
    `projects create --name="${appName}" ${projectId}`,
    false
  );
  if (/error/i.test(response)) {
    console.error(response);
    process.exit(1);
  }

  // enable billing
  gcloud(`components install beta`, null);
  const accountId = path.basename(
    (
      await choiceFrom({
        prompt: 'Select a billing account for this project',
        list: gcloud(`beta billing accounts list --filter=open=true`),
        display: 'displayName'
      })
    ).name
  );
  gcloud(
    `beta billing projects link ${projectId} --billing-account="${accountId}`,
    false
  );

  // enable APIs
  gcloud(`services enable admin.googleapis.com`);
  gcloud(`services enable iap.googleapis.com`);
  gcloud(`services enable secretmanager.googleapis.com`);
  gcloud(`services enable cloudscheduler.googleapis.com`);
  gcloud(`services enable appengine.googleapis.com`);

  // configure workspace admin as owner
  // TODO output directions/links
  const googleDelegatedAdmin = await readline.question(
    'Enter the Google ID for a Workspace Admin who will delegate authority for this app'
  );
  gcloud(
    `projects add-iam-policy-binding ${projectId} --member="user:${googleDelegatedAdmin}" --role="roles/owner"`,
    false
  );

  // create App Engine instance
  // TODO set default region us-east4
  const region = await choiceFrom({
    prompt: 'Select a region for the app engine instance',
    list: gcloud(`app regions list`),
    display: 'region'
  }).region;
  gcloud(`app create --region=${region}`);
  const url = `https://${gcloud(`app describe`).defaultHostname}`;
  fs.writeFileSync(
    '.env',
    `PROJECT=${projectId}
URL=${url}`
  );

  // create default instance so IAP can be configured
  exec(`npm run build`);
  exec(`npm run deploy`);

  // configure IAP (and OAuth consent screen)
  const supportEmail = await nonEmpty({
    prompt: 'Enter a support email address for the app'
  });
  const brand = gcloud(
    `iap oauth-brands create --application_title${appName} --support_email=${supportEmail}`
  ).name;
  const oauth = gcloud(
    `iap oauth-clients create ${brand} --display_name=IAP-App-Engine-app`
  );
  gcloud(
    `iap web enable --resource-type=app-engine --oauth2-client-id=${path.basename(
      oauth.name
    )} --oauth2-client-secret=${oauth.secret}`
  );
  (
    await untilBlank({
      prompt: 'Email address of user who can access the app interface'
    })
  ).forEach((userEmail) =>
    gcloud(
      `projects add-iam-policy-binding ${projectId} --member="user:${userEmail}" --role="roles/iap.httpsResourceAccessor"`,
      false
    )
  );

  // configure Blackbaud SKY app
  const blackbaudAccessKey = await nonEmpty({
    prompt:
      'Enter a subscription access key from https://developer.blackbaud.com/subscriptions'
  });
  console.log('Create a new app at https://developer.blackbaud.com/apps');
  const blackbaudClientId = await nonEmpty({
    prompt: "Enter the app's OAuth client ID"
  });
  const blackbaudClientSecret = await nonEmpty({
    prompt: "Enter one of the app's OAuth secrets"
  });
  const blackbaudRedirectUrl = `${url}/redirect`;
  console.log(`Configure ${blackbaudRedirectUrl} as the app's redirect URL`);
  // TODO pause here?
  // TODO directions for limiting scope of app

  // configure delegated admin service account
  const serviceAccount = gcloud(
    `iam service-accounts create ${appName
      .toLowerCase()
      .replace(/[^a-z]/g, '-')
      .replace(/--/g, '-')} --display-name="Google Delegated Admin"`
  );
  console.log(
    `${googleDelegatedAdmin} needs to follow the directions at https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md`
  );
  const credentials = `${serviceAccount.uniqueId}.json`;
  gcloud(
    `iam service-accounts keys create ${credentials} --iam-account=${serviceAccount.email}`
  );
  console.log(`The Service Account Unique ID is ${serviceAccount.uniqueId}`);
  // TODO pause here?

  // store secrets
  exec(
    `echo "${blackbaudAccessKey}" | gcloud secrets create BLACKBAUD_ACCESS_KEY --data-file=- ${flagsWithProject}`
  );
  exec(
    `echo "null" | gcloud secrets create BLACKBAUD_API_TOKEN --data-file=- ${flagsWithProject}`
  );
  exec(
    `echo "${blackbaudClientId}" | gcloud secrets create BLACKBAUD_CLIENT_ID --data-file=- ${flagsWithProject}`
  );
  exec(
    `echo "${blackbaudClientSecret}" | gcloud secrets create BLACKBAUD_CLIENT_SECRET --data-file=- ${flagsWithProject}`
  );
  exec(
    `echo "${blackbaudRedirectUrl}" | gcloud secrets create BLACKBAUD_REDIRECT_URL --data-file=- ${flagsWithProject}`
  );
  gcloud(`secrets create GOOGLE_CREDENTIALS --data-file=${credentials}`);
  fs.unlinkSync(credentials);

  exec(
    `echo "${googleDelegatedAdmin}" | gcloud secrets create GOOGLE_DELEGATED_ADMIN --data-file=- ${flagsWithProject}`
  );

  console.log(`Authorize the app at ${url}`);
  // TODO pause here?

  // schedule daily sync
  // TODO configurable schedule
  // TODO configurable job name
  gcloud(
    `scheduler jobs create app-engine daily-blackbaud-to-google-sync --schedule="0 1 * * *" --relative-url="/sync"`
  );
})();
