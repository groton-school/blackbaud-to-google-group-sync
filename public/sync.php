<?php

use Google\Client;
use Google\Service\Directory;
use Google\Service\Directory\Member as DirectoryMember;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Group;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Member;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;

require_once __DIR__ . "/../vendor/autoload.php";

session_start();

define("APP_NAME", "Blackbaud to Google Group Sync");

// environment variables
define("Bb_ACCESS_KEY", "BLACKBAUD_ACCESS_KEY");
define("Bb_CLIENT_ID", "BLACKBAUD_CLIENT_ID");
define("Bb_CLIENT_SECRET", "BLACKBAUD_CLIENT_SECRET");
define("Bb_REDIRECT_URL", "BLACKBAUD_REDIRECT_URL");

define("Memcached_SERVERS", "MEMCACHEDCLOUD_SERVERS");
define("Memcached_USERNAME", "MEMCACHEDCLOUD_USERNAME");
define("Memcached_PASSWORD", "MEMCACHEDCLOUD_PASSWORD");

define("Google_DELEGATED_ADMIN", "GOOGLE_DELEGATED_ADMIN");
define("Google_CREDENTIALS", "GOOGLE_CREDENTIALS");

// keys
define("Bb_TOKEN", "blackbaud_token");
define("OAuth2_STATE", "oauth2_state");

// OAuth 2 terms
define("CODE", "code");
define("STATE", "state");
define("AUTHORIZATION_CODE", "authorization_code");
define("REFRESH_TOKEN", "refresh_token");

function step($m)
{
    echo "<h3>$m</h3>";
}

function dump($m, $name = false)
{
    if ($name) {
        echo "<h5>$name</h5>";
    }
    echo "<pre>";
    print_r($m);
    echo "</pre>";
}

try {
    // connect to Memcached server for cached tokens
    $cache = new Memcached();
    $cache->setOption(Memcached::OPT_BINARY_PROTOCOL, true);
    $cache->addServers(
        array_map(function ($server) {
            return explode(":", $server, 2);
        }, explode(",", $_ENV[Memcached_SERVERS]))
    );
    $cache->setSaslAuthData(
        $_ENV[Memcached_USERNAME],
        $_ENV[Memcached_PASSWORD]
    );

    // Blackbaud OAuth2 client
    $sky = new BlackbaudSKY([
        BlackbaudSKY::ACCESS_KEY => $_ENV[Bb_ACCESS_KEY],
        "clientId" => $_ENV[Bb_CLIENT_ID],
        "clientSecret" => $_ENV[Bb_CLIENT_SECRET],
        "redirectUri" => $_ENV[Bb_REDIRECT_URL],
    ]);

    // acquire a Bb SKY API access token
    $token = $cache->get(Bb_TOKEN);
    if (empty($token)) {
        // interactively acquire a new Bb access token
        if (false === isset($_GET[CODE])) {
            $authorizationUrl = $sky->getAuthorizationUrl();
            $_SESSION[OAuth2_STATE] = $sky->getState();
            $cache->set(Bb_TOKEN, null);
            header("Location: " . $authorizationUrl);
            exit();
        } elseif (
            empty($_GET[STATE]) ||
            (isset($_SESSION[OAuth2_STATE]) &&
                $_GET[STATE] !== $_SESSION[OAuth2_STATE])
        ) {
            if (isset($_SESSION[OAuth2_STATE])) {
                unset($_SESSION[OAuth2_STATE]);
            }

            exit("Invalid state");
        } else {
            $token = $sky->getAccessToken(AUTHORIZATION_CODE, [
                CODE => $_GET[CODE],
            ]);
            $cache->set(Bb_TOKEN, $token);
        }
        //    } elseif ($token->hasExpired()) {
    } else {
        step("refresh Bb access token");
        dump($token);
        // use refresh token to get new Bb access token
        $newToken = $sky->getAccessToken(REFRESH_TOKEN, [
            REFRESH_TOKEN => $token->getRefreshToken(),
        ]);
        $cache->set(Bb_TOKEN, $newToken);
        $token = $newToken;
    }

    // create Google API client using private key
    $google = new Client();
    $google->setApplicationName(APP_NAME);
    $google->setAuthConfig(json_decode($_ENV["Google_CREDENTIALS"], true));
    $google->setSubject($_ENV["Google_DELEGATED_ADMIN"]);
    $google->setScopes([
        "https://www.googleapis.com/auth/admin.directory.group",
    ]);
    $google->setAccessType("offline");

    $directory = new Directory($google);

    $school = $school = $sky->endpoint("school/v1");

    step("api clients configured");
    dump($token, "token");

    $lists = $school->get("lists");

    dump($lists, "lists");

    foreach ($lists["value"] as $list) {
        if ($list["category"] === APP_NAME) {
            $bbGroup = new Group($list);
            step($bbGroup->getName());
            $response = $school->get("lists/advanced/{$list["id"]}");
            dump($response, "response");
            // TODO deal with pagination (1000 rows per page, probably not an immediate huge deal)
            /** @var Member[] */
            $bbMembers = [];
            array_walk($response["results"], function ($data) use ($bbMembers) {
                $member = new Member($data);
                $bbMembers[$member->getEmail()] = $member;
            });
            dump($bbMembers, "bbMembers");

            foreach (
                $directory->members->listMembers($bbGroup->getParamEmail())
                as $gMember
            ) {
                /** @var DirectoryMember $gMember */
                /** @var DirectoryMember[] */
                $purge = [];
                if (array_key_exists($gMember->getEmail(), $bbMembers)) {
                    unset($bbMembers[$gMember->getEmail()]);
                } else {
                    array_push($purge, $gMember);
                }
                dump($purge, "purge");
                dump($bbMembers, "bbMembers");
                foreach ($purge as $gMember) {
                    step("purge " . $gMember->getEmail());
                    dump(
                        $directory->members->delete(
                            $bbGroup->getParamEmail(),
                            $gMember->getEmail()
                        )
                    );
                }
                foreach ($bbMembers as $bbMember) {
                    step("add " + $bbMember->getEmail());
                    dump(
                        $directory->members->insert(
                            $bbGroup->getParamEmail(),
                            new DirectoryMember([
                                "email" => $bbMember->getEmail(),
                            ])
                        )
                    );
                }
            }
        }
    }
} catch (Exception $e) {
    dump($e->getTraceAsString(), $e->getMessage());
}
