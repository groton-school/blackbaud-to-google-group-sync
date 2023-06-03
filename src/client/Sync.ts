import * as Progress from './Progress';

export default function Sync() {
  fetch(`${process.env.URL}/ready`)
    .then((response) => response.json())
    .then(({ ready }) => {
      if (ready) {
        fetch(`${process.env.URL}/sync`)
          .then((response) => response.json())
          .then(Progress.display);
      } else {
        // FIXME open new window to do interactive authentication
      }
    });
}
