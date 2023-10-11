#!/usr/bin/env node
import gcloud from '@battis/partly-gcloudy';
gcloud.init();
await gcloud.app.deploy();
console.log('Deploy complete.');
