export default function Deauthorize() {
  fetch(`${process.env.URL}/deauthorize`)
    .then((response) => response.json())
    .then(() => window.location.reload());
}
