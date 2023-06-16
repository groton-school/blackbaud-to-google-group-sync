import { confirm, input } from '@inquirer/prompts';
import open from 'open';
import cli from '../lib/cli.js';
import gcloud from '../lib/gcloud.js';
import { options } from '../lib/options.js';
import validators from '../lib/validators.js';

export default async function guideGoogleWorkspaceAdminDelegation({
  projectName,
  delegatedAdmin = undefined,
  delegated = false
}) {
  delegatedAdmin = await input({
    message: options.delegatedAdmin.description,
    validate: validators.email,
    default: delegatedAdmin
  });
  gcloud.invoke(
    `projects add-iam-policy-binding ${gcloud.getProjectId()} --member="user:${delegatedAdmin}" --role="roles/owner"`,
    false
  );
  gcloud.invoke('services enable admin.googleapis.com');
  const name = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/--/g, '-');
  let serviceAccount = gcloud.invoke(
    `iam service-accounts list --filter=email=${name}@${gcloud.getProjectId()}.iam.gserviceaccount.com`
  )[0];
  if (!serviceAccount) {
    serviceAccount = gcloud.invoke(
      `iam service-accounts create ${name} --display-name="Google Delegated Admin"`
    );
  }
  /*
   * FIXME use Workload Identity Federation
   *  Service account keys could pose a security risk if compromised. We
   *  recommend you avoid downloading service account keys and instead use the
   *  Workload Identity Federation . You can learn more about the best way to
   *  authenticate service accounts on Google Cloud here.
   *  https://cloud.google.com/iam/docs/workload-identity-federation
   *  https://cloud.google.com/blog/products/identity-security/how-to-authenticate-service-accounts-to-help-keep-applications-secure
   */
  /*
   * FIXME max 10 keys available
   *  Need to delete one to create one
   */
  const credentialsPath = `.cache/${serviceAccount.uniqueId}.json`;
  gcloud.invoke(
    `iam service-accounts keys create ${credentialsPath} --iam-account=${serviceAccount.email}`
  );
  if (!delegated) {
    const url =
      'https://github.com/groton-school/blackbaud-to-google-group-sync/blob/main/docs/google-workspace-admin.md';
    open(url);
    await confirm({
      message: `The Service Account Unique ID is ${cli.value(
        serviceAccount.uniqueId
      )}
Confirm that ${cli.value(
        delegatedAdmin
      )} has followed the directions at ${cli.url(url)}`
    });
  }

  return { delegatedAdmin, credentialsPath };
}
