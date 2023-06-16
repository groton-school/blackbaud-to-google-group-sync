import chalk from 'chalk';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const value = chalk.cyan; // mimic @inquirer/prompts
const url = chalk.yellow;

const log = console.log;

const exec = (command) => execSync(command, { stdio: 'inherit' });

function setCWDtoProjectRoot() {
  process.chdir(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
  );
  dotenv.config();
}

export default { exec, log, value, setCWDtoProjectRoot, url };
