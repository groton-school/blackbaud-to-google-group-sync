#!/usr/bin/env node

import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
dotenv.config();

execSync(`gcloud app deploy --project=${process.env.PROJECT} --quiet`, {
  stdio: 'inherit'
});
