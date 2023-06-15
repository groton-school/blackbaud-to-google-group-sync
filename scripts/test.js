import { input } from '@inquirer/prompts';
import { validate as emailValidator } from 'email-validator';

(async () => {
  let delegatedAdmin = undefined;

  if (!delegatedAdmin || !emailValidator(delegatedAdmin)) {
    delegatedAdmin = await input({
      message:
        'Enter the Google ID for a Workspace Admin who will delegate authority for this app',
      validate: emailValidator
    });
  }

  console.log(delegatedAdmin);
})();
