#!/usr/bin/env node
import gcloud from '@battis/partly-gcloudy';
import cli from '@battis/qui-cli';

await gcloud.init();
cli.shell.setSilent(false);
gcloud.app.logs();
