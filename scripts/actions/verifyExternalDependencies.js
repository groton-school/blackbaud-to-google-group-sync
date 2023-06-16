import { execSync } from 'child_process';
import open from 'open';
import cli from '../lib/cli.js';

async function versionTest({
  name,
  download = undefined,
  command = undefined,
  fail = true
}) {
  command = command || `${name} --version`;
  if (!/\d+\.\d/.test(execSync(command))) {
    if (fail) {
      open(download);
      throw new Error(
        `${cli.value(name)} is required${download ? `, install from ${cli.url(download)}` : ''
        }`
      );
    } else {
      return false;
    }
  }
  return true;
}

export default async function verifyExternalDependencies() {
  versionTest({
    name: 'npm',
    download: 'https://nodejs.org/'
  });
  versionTest({
    name: 'gcloud',
    download: 'https://cloud.google.com/sdk/docs/install'
  });
}
