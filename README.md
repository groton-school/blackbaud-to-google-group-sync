# Blackbaud to Google Group Sync

Sync membership of Blackbaud LMS community groups to Google Groups

The basic idea of this script is that it will perform a one-way sync of membership in a subset of Blackbaud community groups into specific Google Groups. Thus, Blackbaud community groups can be set up with SmartGroup rosters that automatically refresh, the sync process runs regularly, and Google Group memberships are updated automatically to match, allowing for the creation of SIS-driven, role-based groups in Google.

## Setup

### Blackbaud

1. Copy one of your [SKY API developer account subscription access keys](https://developer.blackbaud.com/subscriptions/) (this will be the Heroku `BLACKBAUD_ACCESS_KEY` environment variable)
2. Go to your [Applications](https://developer.blackbaud.com/apps/), add a new application.
   1. Give a dummy website URL for now (until the Heroku instance is standing)
   2. Copy the OAuth client ID and secret (these will be the `BLACKBAUD_CLIENT_ID` and `BLACKBAUD_CLIENT_SECRET` Heroku environment variables, respectively.
3. [In the Blackbaud Marketplace](https://app.blackbaud.com/marketplace/manage) click the Connect App button and use the OAuth client ID as the Application ID to connect the app to your Blackbaud instance

...pause while you set up Google...

3. Once Goole is set up, get the address to the the running Google app instance
4. Update [the App in your SKY API developer profile](https://developer.blackbaud.com/apps/) 1. Add a Redirect URI to `https://<instance name>.appspot.com/redirect` 2. Edit the application to set a relevant website URL (e.g. `https://<instance name>.appspot.com`

### Google

1. In [Google Cloud](https://console.cloud.google.com/), create a new project
2. Under [IAM & Admin](https://console.cloud.google.com/iam-admin/iam) add a Google Workspace admin user as a principal with `Owner` role.
3. In [APIs & Services](https://console.cloud.google.com/apis/dashboard)
   1. Enable the `Admin SDK API`
   2. Under [Credentials](https://console.cloud.google.com/apis/credentials), create a Service Account
   3. Add a key to the Service Account and download the JSON credentials file
4. Copy the Unique ID of the Service Account (a 21-digit number)
5. In Google Workspace Admin, go to Security/Access and data control/API controls and [Manage Domain Wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation)
6. Add a new API client
7. The Client ID is the Service Account Unique ID
8. The OAuth scope is `https://www.googleapis.com/auth/admin.directory.group`
9. Authorize

#### Google App Engine setup

#### Memcached setup

#### Secret Manager setup

#### IAP setup

#### Cloud Scheduler setup
