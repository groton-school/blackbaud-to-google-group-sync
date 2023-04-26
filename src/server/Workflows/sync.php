<?php

use Google\Service\Directory;
use Google\Service\Directory\Member as DirectoryMember;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Group;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Member;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\SKY;
use GrotonSchool\BlackbaudToGoogleGroupSync\Google\Google;
use GrotonSchool\BlackbaudToGoogleGroupSync\Sync\Progress;
use Monolog\Level;

require_once __DIR__ . '/../../../vendor/autoload.php';

session_start();

define('APP_NAME', 'Blackbaud to Google Group Sync');

$progress = new Progress();
$progress->setContext(['sync' => $progress->getId()]);
try {
    $message = 'unknown failure';
    $token = SKY::getToken($_SERVER, $_SESSION, $_GET);
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

    Google::init(APP_NAME);
    $directory = new Directory(Google::api());

    $school = SKY::api()->endpoint('school/v1');
    $lists = array_filter(
        $school->get('lists')['value'],
        fn($list) => $list['category'] == APP_NAME
    );
    $progress->setMax(count($lists));
    foreach ($lists as $list) {
        $bbGroup = new Group($list);
        $progress->setStatus($bbGroup->getName());
        $response = $school->get("lists/advanced/{$list['id']}");

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
    $message = 'complete';
} catch (Exception $e) {
    $progress->exception($e);
    $message = $e->getMessage();
}
$progress->setStatus($message);
