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
use Monolog\Handler\SyslogHandler;
use Monolog\Level;
use Monolog\Logger;

require_once __DIR__ . '/../vendor/autoload.php';

session_start();

// TODO objectify this script so it's not a hunk of spaghetti code
// TODO implement daemon or crontab scheduling for regular runs

define('APP_NAME', 'Blackbaud to Google Group Sync');

// environment variables
define('Bb_ACCESS_KEY', 'BLACKBAUD_ACCESS_KEY');
define('Bb_CLIENT_ID', 'BLACKBAUD_CLIENT_ID');
define('Bb_CLIENT_SECRET', 'BLACKBAUD_CLIENT_SECRET');
define('Bb_REDIRECT_URL', 'BLACKBAUD_REDIRECT_URL');

define('Google_DELEGATED_ADMIN', 'GOOGLE_DELEGATED_ADMIN');
define('Google_CREDENTIALS', 'GOOGLE_CREDENTIALS');

// keys
define('Bb_TOKEN', 'blackbaud_token');
define('OAuth2_STATE', 'oauth2_state');

// OAuth 2 terms
define('CODE', 'code');
define('STATE', 'state');
define('AUTHORIZATION_CODE', 'authorization_code');
define('REFRESH_TOKEN', 'refresh_token');

$logger = new Logger('blackbayd-to-google-group-sync');
$syslog = new SyslogHandler('sync', LOG_USER, Level::Debug);
$logger->pushHandler($syslog);

$syncId = substr(md5(time()), 0, 6);
$logger->log(Level::Info, "start sync [$syncId]");
$message = 'unknown failure';

try {
    // connect to Memcached for cached tokens
    $cache = new Memcached();

    // Blackbaud OAuth2 client
    $sky = new BlackbaudSKY([
        BlackbaudSKY::ACCESS_KEY => Secrets::get(Bb_ACCESS_KEY),
        'clientId' => Secrets::get(Bb_CLIENT_ID),
        'clientSecret' => Secrets::get(Bb_CLIENT_SECRET),
        'redirectUri' => Secrets::get(Bb_REDIRECT_URL),
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
            header('Location: ' . $authorizationUrl);
            exit();
        } elseif (
            empty($_GET[STATE]) ||
            (isset($_SESSION[OAuth2_STATE]) &&
                $_GET[STATE] !== $_SESSION[OAuth2_STATE])
        ) {
            if (isset($_SESSION[OAuth2_STATE])) {
                unset($_SESSION[OAuth2_STATE]);
            }

            exit('Invalid state');
        } else {
            $token = $sky->getAccessToken(AUTHORIZATION_CODE, [
                CODE => $_GET[CODE],
            ]);
            $cache->set(Bb_TOKEN, $token);
        }
    } elseif ($token->hasExpired()) {
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
        'https://www.googleapis.com/auth/admin.directory.group',
    ]);
    $google->setAccessType('offline');

    $directory = new Directory($google);

    $school = $school = $sky->endpoint('school/v1');

    $lists = $school->get('lists');

    foreach ($lists['value'] as $list) {
        if ($list['category'] === APP_NAME) {
            $bbGroup = new Group($list);
            $logger->log(
                Level::Info,
                "Blackbaud group '{$bbGroup->getName()}' [$syncId]"
            );
            $response = $school->get("lists/advanced/{$list['id']}");
            // TODO deal with pagination (1000 rows per page, probably not an immediate huge deal)
            /** @var Member[] */
            $bbMembers = [];
            foreach ($response['results']['rows'] as $data) {
                try {
                    $member = new Member($data);
                    $bbMembers[$member->getEmail()] = $member;
                } catch (Exception $e) {
                    $logger->log(
                        Level::Warning,
                        "{$e->getMessage()} [$syncId]" .
                            PHP_EOL .
                            json_encode($data, JSON_PRETTY_PRINT)
                    );
                }
            }
            $logger->log(
                Level::Info,
                count($bbMembers) . " members in Blackbaud [$syncId]"
            );

            // TODO need to test for existence of Google Group and create if not present
            // TODO should have a param that determines if Google Groups are created if not found
            $purge = [];
            $gGroup = $directory->members->listMembers(
                $bbGroup->getParamEmail()
            );
            $logger->log(
                Level::Info,
                "'Google group '{$bbGroup->getParamEmail()}' [$syncId]"
            );
            $logger->log(
                Level::Info,
                count($gGroup) . " members in Google [$syncId]"
            );
            foreach ($gGroup as $gMember) {
                /** @var DirectoryMember $gMember */
                /** @var DirectoryMember[] */
                if (array_key_exists($gMember->getEmail(), $bbMembers)) {
                    unset($bbMembers[$gMember->getEmail()]);
                } else {
                    if (
                        $gMember->getRole() !== 'OWNER' ||
                        ($bbGroup->getParamDangerouslyPurgeGoogleGroupOwners() &&
                            $gMember->getRole() === 'OWNER')
                    ) {
                        array_push($purge, $gMember);
                    }
                }
            }
            foreach ($purge as $gMember) {
                $logger->log(
                    Level::Info,
                    "delete '{$gMember->getEmail()}' [$syncId]"
                );
                $directory->members->delete(
                    $bbGroup->getParamEmail(),
                    $gMember->getEmail()
                );
            }

            foreach ($bbMembers as $bbMember) {
                $logger->log(
                    Level::Info,
                    "add '{$bbMember->getEmail()}' [$syncId]"
                );
                $directory->members->insert(
                    $bbGroup->getParamEmail(),
                    new DirectoryMember([
                        'email' => $bbMember->getEmail(),
                    ])
                );
            }

            if ($bbGroup->getParamUpdateName()) {
                $gGroup = $directory->groups->get($bbGroup->getParamEmail());
                if ($gGroup->getName() != $bbGroup->getName()) {
                    $logger->log(
                        Level::Info,
                        "group name change to '{$bbGroup->getName()}' [$syncId]"
                    );
                    $gGroup->setName($bbGroup->getName());
                    $directory->groups->update($gGroup->getId(), $gGroup);
                }
            }
        }
    }
    $logger->log(Level::Info, "end sync [$syncId]");
    $message = 'Sync complete';
} catch (Exception $e) {
    $log->logger(
        Level::Info,
        "{$e->getMessage()} [$syncId]" . PHP_EOL . $e->getTraceAsString()
    );
    $message = $e->getMessage();
}
?>
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Blackbaud to Google Group Sync</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css" rel="stylesheet" crossorigin="anonymous">
    </head>
    <body>
        <div class="container">
            <h1>Blackbaud to Google Group Sync</h1>
            <p><?= $message ?></p>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
</html>
