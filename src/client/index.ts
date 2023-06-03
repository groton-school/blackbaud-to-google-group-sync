import * as Options from './Options';
import Sync from './Sync';

fetch(`${process.env.URL}/ready`)
  .then((response) => response.json())
  .then(({ ready }) => {
    if (ready) {
      Options.add({ title: 'Start Sync', handler: Sync, primary: true });
      Options.add({ title: 'Deauthorize', handler: console.log });
    } else {
      Options.add({ title: 'Authorize', handler: console.log, primary: true });
    }
  });
