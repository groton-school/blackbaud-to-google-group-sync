import { confirm, select } from '@inquirer/prompts';
import open from 'open';
import path from 'path';
import cli from '../lib/cli.js';
import gcloud from '../lib/gcloud.js';

export default async function enableBilling({ accountId = undefined }) {
  if (!accountId) {
    const choices = gcloud
      .invokeBeta(`billing accounts list --filter=open=true`)
      .map((account) => ({
        name: account.displayName,
        value: path.basename(account.name)
      }));
    if (choices.length > 1) {
      accountId = await select({
        message: 'Select a billing account for this project',
        choices
      });
    } else if (
      choices.length === 1 &&
      (await confirm({
        message: `Use billing account ${cli.value(choices[0].name)}?`
      }))
    ) {
      accountId = choices[0].value;
    }
  }

  if (accountId) {
    gcloud.invokeBeta(
      `billing projects link ${gcloud.getProjectId()} --billing-account="${accountId}"`,
      false
    );
  } else {
    await open(
      `https://console.cloud.google.com/billing/?project=${gcloud.getProjectId()}`
    );
    await confirm({
      message:
        'Confirm that you have created a billing account for this project'
    });
  }
}
