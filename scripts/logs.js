#!/usr/bin/env node
const cli = require('@battis/qui-cli');
const gcloud = require('@battis/partly-gcloudy');

gcloud.init();
cli.shell.setSilent(false);
gcloud.app.logs();
