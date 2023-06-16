#!/usr/bin/env node

import { execSync } from 'child_process';
import process from 'process';
import cli from './lib/cli.js';

cli.setCWDtoProjectRoot();

execSync(
  `gcloud app logs tail -s default --project=${process.env.PROJECT} --quiet`,
  {
    stdio: 'inherit'
  }
);
