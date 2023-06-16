import { jack } from 'jackspeak';
import cli from './cli.js';

export const options = {
  project: {
    description: 'Google Cloud project unique identifier'
  },
  name: {
    description: 'Google Cloud project name',
    default: 'Blackbaud-to-Google Group Sync'
  },
  billing: {
    description: 'Google Cloud billing account ID for this project'
  },
  delegatedAdmin: {
    description:
      'Google Workspace admin account that will delegate access to Admin SDK API'
  },
  region: {
    description: 'Google Cloud region in which to create App Engine instance'
  },
  supportEmail: {
    description: 'Support email address for app OAuth consent screen'
  },
  users: {
    description: 'Google IDs of users allowed to access app (comma-separated)'
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
    default: 'daily-blackbaud-to-google-group-sync'
  },
  scheduleCron: {
    description: 'Google Cloud Scheduler crontab definition for automatic sync',
    default: '0 1 * * *'
  }
};

export async function parseArguments() {
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
    cli.log(j.usage());
    process.exit(0);
  }
  return values;
}
