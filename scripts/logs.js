require('dotenv').config();
const execSync = require('child_process').execSync;

execSync(
  `gcloud app logs tail -s default --project=${process.env.PROJECT} --quiet`,
  {
    stdio: 'inherit'
  }
);
