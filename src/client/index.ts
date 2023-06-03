import Authorize from './Authorize';
import Deauthorize from './Deauthorize';
import * as Options from './Options';
import Sync from './Sync';

const sync = Options.add({
  title: 'Start Sync',
  handler: Sync,
  primary: true,
  enabled: false
});

fetch(`${process.env.URL}/ready`)
  .then((response) => response.json())
  .then(({ ready }) => {
    if (ready) {
      sync.disabled = false;
      Options.add({ title: 'Deauthorize', handler: Deauthorize });
    } else {
      Options.add({ title: 'Authorize', handler: Authorize, primary: true });
    }
  });
