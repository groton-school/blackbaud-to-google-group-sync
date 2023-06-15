# Blackbaud to Google Group Sync

Sync membership of Blackbaud LMS community groups to Google Groups

The basic idea of this script is that it will perform a one-way sync of membership in a subset of Blackbaud community groups into specific Google Groups. Thus, Blackbaud community groups can be set up with SmartGroup rosters that automatically refresh, the sync process runs regularly, and Google Group memberships are updated automatically to match, allowing for the creation of SIS-driven, role-based groups in Google.

## Setup

You need to prep the repository from a development workstation. You will need the following toolchain installed:

- [`npm`](nodejs.org) installed as part of `node.js`
- [`composer`](https://pnpm.io/)
- [`git`](https://git-scm.com/)
- [`gcloud`](https://cloud.google.com/sdk/docs/install)

In your shell:

```bash
git clone https://github.com/groton-school/blackbaud-to-google-group-sync.git
cd blackbaud-to-google-group-sync
npm install
composer install
node scripts/setup.js
```

The setup script will prompt you with a series of interactive questions to enter credentials from Blackbaud SKY and to make choices about configuration in Google Cloud, including app access.
