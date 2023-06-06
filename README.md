# Blackbaud to Google Group Sync

Sync membership of Blackbaud LMS community groups to Google Groups

The basic idea of this script is that it will perform a one-way sync of membership in a subset of Blackbaud community groups into specific Google Groups. Thus, Blackbaud community groups can be set up with SmartGroup rosters that automatically refresh, the sync process runs regularly, and Google Group memberships are updated automatically to match, allowing for the creation of SIS-driven, role-based groups in Google.

## Setup

### Repo

You need to prep the repository from a development workstation. You will need the following toolchain installed:

- [`npm`](nodejs.org) installed as part of `node.js`
- [`pnpm`](https://pnpm.io/) not 100% necessary, but so much faster than `npm`
- [`composer`](https://pnpm.io/)
- [`git`](https://git-scm.com/)

In your shell:

```bash
git clone https://github.com/groton-school/blackbaud-to-google-group-sync.git
cd blackbaud-to-google-group-sync
pnpm install
composer install
cp .env.example .env
```

We'll come back to this after we get a bit more set up.

Pause here. We'll finish this once Google is setup.

### Google

The actual running app is hosted in the Google Cloud.

1. In [Google Cloud](https://console.cloud.google.com/), create a new project
2. Under [IAM & Admin](https://console.cloud.google.com/iam-admin/iam) add a Google Workspace admin user as a principal with `Owner` role. (Their username will become the `GOOGLE_DELEGATED_ADMIN` Secret)
3. In [APIs & Services](https://console.cloud.google.com/apis/dashboard)
   1. Configure the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
   1. Create with User type Internal
   1. Add App information (minimally App name, User support email, developer email) and Save and Continue
   1. Enable the `Admin SDK API`
   1. Under [Credentials](https://console.cloud.google.com/apis/credentials), create a Service Account
   1. Add a key to the Service Account and download the JSON credentials file (contents will become the `GOOGLE_CREDENTIALS` Secret)
4. Copy the Unique ID of the Service Account (a 21-digit number)
5. In Google Workspace Admin, go to Security/Access and data control/API controls and [Manage Domain Wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation)
6. Add a new API client
7. The Client ID is the Service Account Unique ID
8. The OAuth scope is `https://www.googleapis.com/auth/admin.directory.group`
9. Authorize

#### App Engine setup

The app is built and hosted by App Engine (running on PHP).

1. In [Google Cloud](https://console.cloud.google.com/), make sure that the project created above is selected.
2. Under [App Engine](https://console.cloud.google.com/appengine), create an application
   1. Select a region close to you (or your Blackbaud hosted instance)
   2. Select the App Engine default service account (or leave blank to effect the same selection)
   3. Click "I'll do this later" when asked to select a language, `gcloud init`, etc.
3. On your workstation, edit the `.env` file that you created earlier
   1. Set `PROJECT` to the Project ID on the [Cloud Console Dashboard](https://console.cloud.google.com/home/dashboard)
   2. Set `URL` to the URL on the [App Engine Dashboard](https://console.cloud.google.com/appengine)
   3. In your shell:

```bash
npm run build
npm run deploy
```

#### Identity-Aware Proxy setup

The app can only be accessed by whitelisted Google users.

1. In [App Engine](https://console.cloud.google.com/), choose [Settings](https://console.cloud.google.com/appengine/settings)
2. Choose Configure Now under the Identy-Aware Proxy
3. Enable API and then Go to Identity-Aware Proxy
4. Under All Web Services, toggle on IAP for the App Engine app and click Turn on when asjed
5. Under [IAM & Admin](https://console.cloud.google.com/iam-admin/iam) choose IAM
6. Grant Access
   1. Enter the Google IDs of the users who should be able to access the app
   2. Select a role and choose IAP-secured Web App User and Save

### Blackbaud

The app has access to the Blackbaud SKY API to look up list/group information.

1. Copy one of your [SKY API developer account subscription access keys](https://developer.blackbaud.com/subscriptions/)
2. Go to your [Applications](https://developer.blackbaud.com/apps/), add a new application.
   1. Set a relevant website URL (e.g. `<URL value from .env file>`)
   2. Copy the OAuth client ID and one of the secrets (these will be the `BLACKBAUD_CLIENT_ID` and `BLACKBAUD_CLIENT_SECRET` Google Secrets, respectively.
3. Add a Redirect URI to `<URL value from .env file>/redirect`
4. Under Scopes, give Read access to Education Management
5. [In the Blackbaud Marketplace](https://app.blackbaud.com/marketplace/manage) click the Connect App button and use the OAuth Client ID as the Application ID to connect the app to your Blackbaud instance

### Google (again)

#### Secret Manager setup

The app stores credentials encrypted in the Secret Manager

1. Under [Security](https://console.cloud.google.com/security/secret-manager) go to Secret Manager
2. Enable the API
3. Create the following secrets
   1. `BLACKBAUD_ACCESS_KEY` is one of your [Blackbaud subscription access keys](https://developer.blackbaud.com/subscriptions/)
   2. `BLACKBAUD_API_TOKEN` has initial value `null` (will be set interactively)
   3. `BLACKBAUD_CLIENT_ID` value from the SKY app above
   4. `BLACKBAUD_CLIENT_SECRET` value from the SKY app above
   5. `BLACKBAUD_REDIRECT_URL` _identical_ to the one used in the SKY app above
   6. `GOOGLE_CREDENTIALS` is the contents of the credentials JSON file downloaded above.
   7. `GOOGLE_DELEGATED_ADMIN` is the email/Google ID of the Workspace Admin above.
4. Point your browser to the URL from the `.env` file and click Authorize
5. Authorize the app to access the Blackbaud SKY API

#### Cloud Scheduler setup

1. Go to the [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. Create Job
   1. Name it something reasonable like `daily-blackbaud-to-google-group-sync`
   2. Set a frequency, e.g. `0 1 * * *`
   3. Choose a timezone
   4. Continue
   5. Target type is App Engine HTTP
   6. URL is `/sync`
   7. HTTP Method is 'GET`
