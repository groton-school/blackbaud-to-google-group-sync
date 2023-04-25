<?php

use Battis\LazySecrets\Secrets;
use Google\AppEngine\Api\Memcache\Memcached;
use Google\Client;
use Google\Service\Directory;
use Google\Service\Directory\Member as DirectoryMember;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Group;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Member;
use GrotonSchool\BlackbaudToGoogleGroupSync\Sync\Progress;
use GrotonSchool\OAuth2\Client\Provider\BlackbaudSKY;
use League\OAuth2\Client\Token\AccessToken;
use Monolog\Level;

require_once __DIR__ . '/../../../vendor/autoload.php';

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

$progress = new Progress();
$progress->setContext(['sync' => $progress->getId()]);
try {
    $message = 'unknown failure';

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

    $progress->setStatus('start');

    $content = json_encode([
        'id' => $progress->getId(),
        'message' => 'Sync started',
        'status' =>
            'https://' .
            $_SERVER['HTTP_HOST'] .
            '/progress?id=' .
            $progress->getId(),
    ]);
    ignore_user_abort(true);
    header('Content-Type: application/json');
    header('Content-Length: ' . strlen($content));
    header('Connection: close');
    echo $content;
    flush();

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

    $lists = array_filter(
        $school->get('lists')['value'],
        fn($list) => $list['category'] == APP_NAME
    );

    $progress->setMax(count($lists));
    foreach ($lists as $list) {
        $bbGroup = new Group($list);
        $progress->setStatus($bbGroup->getName());
        $response = $school->get("lists/advanced/{$list['id']}");
        // TODO deal with pagination (1000 rows per page, probably not an immediate huge deal)
        /** @var Member[] */
        $bbMembers = [];
        foreach ($response['results']['rows'] as $data) {
            try {
                $member = new Member($data);
                $bbMembers[$member->getEmail()] = $member;
            } catch (Exception $e) {
                $progress->exception($e, ['data' => $data], Level::Warning);
            }
        }
        $progress->setStatus('Parsed Blackbaud group information', [
            'blackbaud-id' => $bbGroup->getId(),
            'name' => $bbGroup->getName(),
            'count' => count($bbMembers),
        ]);
        $bbProgress = new Progress([
            'name' => 'Blackbaud',
            'status' => $bbGroup->getName(),
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($bbProgress);

        // TODO need to test for existence of Google Group and create if not present
        // TODO should have a param that determines if Google Groups are created if not found
        $purge = [];
        $gGroup = $directory->members->listMembers($bbGroup->getParamEmail());
        $progress->setStatus('Parsed Google group information', [
            'blackbaud-id' => $bbGroup->getId(),
            'email' => $bbGroup->getParamEmail(),
            'count' => count($gGroup),
        ]);
        $gProgress = new Progress([
            'name' => 'Google',
            'max' => count($gGroup),
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($gProgress);
        foreach ($gGroup as $gMember) {
            /** @var DirectoryMember $gMember */
            $gProgress->setStatus($gMember->getEmail(), null, null);
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
            $gProgress->increment();
        }
        $progress->removeChild($gProgress);
        $purgeProgress = new Progress([
            'name' => 'Purge',
            'max' => count($purge),
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($purgeProgress);
        foreach ($purge as $gMember) {
            $purgeProgress->setStatus("Removing '{$gMember->getEmail()}'");
            $directory->members->delete(
                $bbGroup->getParamEmail(),
                $gMember->getEmail()
            );
            $purgeProgress->increment();
        }
        $progress->removeChild($purgeProgress);

        $bbProgress->setMax(
            count($bbMembers) + ($bbGroup->getParamUpdateName() ? 1 : 0)
        );
        foreach ($bbMembers as $bbMember) {
            try {
                $bbProgress->setStatus("Adding '{$bbMember->getEmail()}'");
                $directory->members->insert(
                    $bbGroup->getParamEmail(),
                    new DirectoryMember([
                        'email' => $bbMember->getEmail(),
                    ])
                );
                $bbProgress->increment();
            } catch (Exception $e) {
                $error = json_decode($e->getMessage(), true)['error'];
                $bbProgress->log(
                    Level::Warning,
                    $error['message'],
                    array_merge(['email' => $bbMember->getEmail()], $error)
                );
            }
        }

        if ($bbGroup->getParamUpdateName()) {
            $gGroup = $directory->groups->get($bbGroup->getParamEmail());
            if ($gGroup->getName() != $bbGroup->getName()) {
                $bbProgress->setStatus(
                    "Changing group name to '{$bbGroup->getName()}'"
                );
                $gGroup->setName($bbGroup->getName());
                $directory->groups->update($gGroup->getId(), $gGroup);
            }
        }
        $progress->removeChild($bbProgress);
        $progress->increment();
    }
    $message = 'end';
} catch (Exception $e) {
    $progress->exception($e);
    $message = $e->getMessage();
}
$progress->setStatus($message);
