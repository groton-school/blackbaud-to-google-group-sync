<?php

require_once __DIR__ . "/../vendor/autoload.php";

define("Memcached_SERVERS", "MEMCACHEDCLOUD_SERVERS");
define("Memcached_USERNAME", "MEMCACHEDCLOUD_USERNAME");
define("Memcached_PASSWORD", "MEMCACHEDCLOUD_PASSWORD");
define("Bb_TOKEN", "blackbaud_token");

$cache = new Memcached();
$cache->setOption(Memcached::OPT_BINARY_PROTOCOL, true);
$cache->addServers(
    array_map(function ($server) {
        return explode(":", $server, 2);
    }, explode(",", $_ENV[Memcached_SERVERS]))
);
$cache->setSaslAuthData($_ENV[Memcached_USERNAME], $_ENV[Memcached_PASSWORD]);

$cache->set(Bb_TOKEN, null);
