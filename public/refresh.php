<?php

use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;

require_once __DIR__ . "/../vendor/autoload.php";

$sky = new BlackbaudSKY([
    /**
     * Blackbaud subscription access key
     * @link https://developer.blackbaud.com/subscriptions/
     */
    BlackbaudSKY::ACCESS_KEY => getenv("BLACKBAUD_ACCESS_KEY"),

    /**
     * OAuth 2.0 App Credentials
     * @link https://developer.blackbaud.com/apps/
     */
    // The client ID assigned to you by the provider
    "clientId" => getenv("BLACKBAUD_CLIENT_ID"),
    // The client password assigned to you by the provider
    "clientSecret" => getenv("BLACKBAUD_CLIENT_SECRET"),
]);

$mc = new Memcached();
$mc->setOption(Memcached::OPT_BINARY_PROTOCOL, true);
$mc->addServers(
    array_map(function ($server) {
        return explode(":", $server, 2);
    }, explode(",", $_ENV["MEMCACHEDCLOUD_SERVERS"]))
);
$mc->setSaslAuthData(
    $_ENV["MEMCACHEDCLOUD_USERNAME"],
    $_ENV["MEMCACHEDCLOUD_PASSWORD"]
);

$existingAccessToken = $mc->get("token"); // get access token from your data store

// FIXME normally we'd test $existingAccessToken->hasExpired() before refreshing
$newAccessToken = $sky->getAccessToken("refresh_token", [
    "refresh_token" => $existingAccessToken->getRefreshToken(),
]);
$mc->set("token", $newAccessToken);

// Purge old access token and store new access token to your data store.
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Refresh Token</title>
    </head>
    <body>
    <h1>Refresh Token</h1>
    <p>Requested an access token using <code>refresh</code> flow.</p>
    <h3>Access Token</h3>
    <p><?php if ($newAccessToken) {
        echo "Stored in Memcached.";
    } else {
        echo "Failed.";
    } ?></p>
    <form method="post" action="refresh.php">
        <button type="submit">Refresh Token</button>
    </form>
    </body>
</html>
