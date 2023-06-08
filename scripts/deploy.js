require('dotenv').config();
const execSync = require('child_process').execSync;

execSync(`gcloud app deploy --project=${process.env.PROJECT} --quiet`, {
  stdio: 'inherit'
});
