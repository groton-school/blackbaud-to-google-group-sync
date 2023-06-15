import chalk from 'chalk';
import { execSync } from 'child_process';
import open from 'open';

const value = chalk.cyan; // mimic @inquirer/prompts
const url = chalk.yellow;

const log = console.log;

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
        `${value(name)} is required${download ? `, install from ${value(download)}` : ''
        }`
      );
    } else {
      return false;
    }
  }
  return true;
}

export default { exec, log, value, url, versionTest };
