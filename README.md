# Blackbaud-to-Google Group Sync

Sync entries in Blackbaud LMS Advanced Lists (potentially of community groups) to Google Groups

The original idea of this tool was to try to directly sync membership in Blackbaud LMS community groups into Google Groups. When it became apparent that the strategy that would work for this was to create Advanced Lists of users with memberships in those community groups and to sync those advanced lists, the tool's purpose broadened somewhat. A description of setting up the advanced lists to sync a specific community group membership is described [here](./docs/group-roster-list.md),

At present we use this tool mostly _without_ matching community groups in our SIS, but instead syncing Advanced Lists that align with user Roles within the SIS (for example, all users who are Students, or Coaches, or members of a particular graduating class or in a particular department). Each of these synced roles just requires an Advanced List to select the users, with [some JSON-formatted comments](./docs/blackbaud-advanced-list-config.md) to direct it to a specific Google Group.

The app itself runs in a Google App Engine instance, and schedules itself to run nightly to automatically sync any groups that it finds in the `Blackbaud to Google Groups Sync` category in the SIS Advanced Lists.

## Caution

Obviously, when defining the Advanced Lists that will be synced into Google Groups, you want to examine your results carefully. One particular filter that we have found necessary to include in just about all lists is `User Login Security.Deny type` `any of` `Has Access` -- which seems like it would be redundant, but is good failsafe if an account is merely disabled, without changing any of the roles (yet).

## Setup

You need to prep the repository from a development workstation. You will need the following tools installed:

- [`git`](https://git-scm.com/) to pull the repository (or just download the zip file, I suppose)
- [`composer`](https://pnpm.io/) to load PHP dependencies
- [`npm`](nodejs.org) installed as part of `node.js` (optionally, my preferred alternative to `npm` is [`pnpm`](https://pnpm.io/installation)) to load Node dependencies (used for setup and deployment)
- [`gcloud`](https://cloud.google.com/sdk/docs/install) which is invoked by the setup scripts to configure the Google Project for the App Engine instance.

In your shell:

```bash
git clone https://github.com/groton-school/blackbaud-to-google-group-sync.git path/to/project
cd path/to/project
composer install
npm install
npm run setup
```

The setup script will prompt you with a series of interactive questions to enter credentials from Blackbaud SKY and to make choices about configuration in Google Cloud, including [Google Workspace Admin delegation](./docs/google-workspace-admin.md).

Calling the setup script with the `--help` flag describes its usage (which includes the ability to pass in all user-configurable values from the command line) -- although it will still confirm those values interactively as it runs.

```bash
./scripts/setup.js --help
```
