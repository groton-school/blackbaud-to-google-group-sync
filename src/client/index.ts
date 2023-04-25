const content = document.querySelector('#content');
content &&
  (content.innerHTML = `
<h1>Blackbaud to Google Groups Sync</h1>
<ul>
    <li>
        <a href="sync">Sync</a>
    </li>
    <li>
        <a href="clear-cache">Clear Cache</a>
    </li>
</ul>
`);
