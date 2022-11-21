<?php

use Google\AppEngine\Api\Memcache\Memcached;

require_once __DIR__ . "/../vendor/autoload.php";

define("Bb_TOKEN", "blackbaud_token");

$cache = new Memcached();
$cache->set(Bb_TOKEN, null);
