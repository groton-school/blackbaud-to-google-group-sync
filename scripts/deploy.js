#!/usr/bin/env node
const gcloud = require('@battis/partly-gcloudy');
gcloud.init();
gcloud.app.deploy();
