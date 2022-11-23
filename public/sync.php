<?php

use Battis\LazySecrets\Secrets;
use Google\AppEngine\Api\Memcache\Memcached;
use Google\Client;
use Google\Service\Directory;
use Google\Service\Directory\Member as DirectoryMember;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Group;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Member;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;
use League\OAuth2\Client\Token\AccessToken;

require_once __DIR__ . "/../vendor/autoload.php";

session_start();

// TODO objectify this script so it's not a hunk of spaghetti code
// TODO implement daemon or crontab scheduling for regular runs
// TODO update documentation to remove the (redundant) community groups step

define("APP_NAME", "Blackbaud to Google Group Sync");

// environment variables
define("Bb_ACCESS_KEY", "BLACKBAUD_ACCESS_KEY");
define("Bb_CLIENT_ID", "BLACKBAUD_CLIENT_ID");
define("Bb_CLIENT_SECRET", "BLACKBAUD_CLIENT_SECRET");
define("Bb_REDIRECT_URL", "BLACKBAUD_REDIRECT_URL");

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

// TODO implement logging and/or notifications

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
    var_dump($m);
    echo "</pre>";
}

try {
    // connect to Memcached for cached tokens
    $cache = new Memcached();

    // Blackbaud OAuth2 client
    $sky = new BlackbaudSKY([
        BlackbaudSKY::ACCESS_KEY => Secrets::get(Bb_ACCESS_KEY),
        "clientId" => Secrets::get(Bb_CLIENT_ID),
        "clientSecret" => Secrets::get(Bb_CLIENT_SECRET),
        "redirectUri" => Secrets::get(Bb_REDIRECT_URL),
    ]);

    // acquire a Bb SKY API access token
    /** @var AccessToken|null $token **/
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
    } elseif ($token->hasExpired()) {
        step("refresh Bb access token");
        dump($token);
        // use refresh token to get new Bb access token
        $newToken = $sky->getAccessToken(REFRESH_TOKEN, [
            REFRESH_TOKEN => $token->getRefreshToken(),
        ]);
        $cache->set(Bb_TOKEN, $newToken);
        $token = $newToken;
    } else {
        $sky->setAccessToken($token);
    }

    // create Google API client using private key
    $google = new Client();
    $google->setApplicationName(APP_NAME);
    $google->setAuthConfig(json_decode(Secrets::get(Google_CREDENTIALS), true));
    $google->setSubject(Secrets::get(Google_DELEGATED_ADMIN));
    $google->setScopes([
        "https://www.googleapis.com/auth/admin.directory.group",
    ]);
    $google->setAccessType("offline");

    $directory = new Directory($google);

    $school = $school = $sky->endpoint("school/v1");

    step("api clients configured");

    $lists = $school->get("lists");

    foreach ($lists["value"] as $list) {
        if ($list["category"] === APP_NAME) {
            $bbGroup = new Group($list);
            step($bbGroup->getName());
            dump($bbGroup, "bbGroup");
            $response = $school->get("lists/advanced/{$list["id"]}");
            // TODO deal with pagination (1000 rows per page, probably not an immediate huge deal)
            /** @var Member[] */
            $bbMembers = [];
            foreach ($response["results"]["rows"] as $data) {
                $member = new Member($data);
                dump($member, "member");
                $bbMembers[$member->getEmail()] = $member;
            }
            dump($bbMembers, "bbMembers");

            step("compare to Google membership");
            // TODO need to test for existence of Google Group and create if not present
            // TODO should have a param that determines if Google Groups are created if not found
            $purge = [];
            foreach (
                $directory->members->listMembers($bbGroup->getParamEmail())
                as $gMember
            ) {
                dump($gMember, "gMember");
                /** @var DirectoryMember $gMember */
                /** @var DirectoryMember[] */
                if (array_key_exists($gMember->getEmail(), $bbMembers)) {
                    unset($bbMembers[$gMember->getEmail()]);
                } else {
                    if (
                        $gMember->getRole() !== "OWNER" ||
                        ($bbGroup->getParamDangerouslyPurgeGoogleGroupOwners() &&
                            $gMember->getRole() === "OWNER")
                    ) {
                        array_push($purge, $gMember);
                    }
                }
            }
            dump($purge, "purge");
            dump($bbMembers, "bbMembers");
            step("purge members not present in Bb group");
            foreach ($purge as $gMember) {
                step("purge " . $gMember->getEmail());
                dump(
                    $directory->members->delete(
                        $bbGroup->getParamEmail(),
                        $gMember->getEmail()
                    )
                );
            }
            step("add members not present in Google group");
            foreach ($bbMembers as $bbMember) {
                step("add " . $bbMember->getEmail());
                dump(
                    $directory->members->insert(
                        $bbGroup->getParamEmail(),
                        new DirectoryMember([
                            "email" => $bbMember->getEmail(),
                        ])
                    )
                );
            }

            // TODO Do we want to think about how to update the actual email address?
            step("update name");
            dump($bbGroup->getParamUpdateName(), "update-name");
            if ($bbGroup->getParamUpdateName()) {
                $gGroup = $directory->groups->get($bbGroup->getParamEmail());
                if ($gGroup->getName() != $bbGroup->getName()) {
                    $gGroup->setName($bbGroup->getName());
                    dump($gGroup, "gGroup");
                    dump($directory->groups->update($gGroup->getId(), $gGroup));
                }
            }
        }
    }
    step("complete");
} catch (Exception $e) {
    step("EXCEPTION");
    dump($e->getMessage());
    dump($e->getTraceAsString());
}
