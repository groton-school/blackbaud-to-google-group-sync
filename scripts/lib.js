import { execSync } from 'child_process';
import open from 'open';

const exec = (command) => execSync(command, { stdio: 'inherit' });

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
        `${name} is required${download ? `, install from ${download}` : ''}`
      );
    } else {
      return false;
    }
  }
  return true;
}

export default { exec, versionTest };
