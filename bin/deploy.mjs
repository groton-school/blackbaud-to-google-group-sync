#!/usr/bin/env node
import gcloud from '@battis/partly-gcloudy';

await gcloud.init();
await gcloud.app.deploy();
console.log('Deploy complete.');
