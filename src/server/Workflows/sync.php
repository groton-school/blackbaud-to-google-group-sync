<?php

use Google\Service\Directory;
use Google\Service\Directory\Member as DirectoryMember;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Group;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\Member;
use GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud\SKY;
use GrotonSchool\BlackbaudToGoogleGroupSync\Google\Google;
use GrotonSchool\BlackbaudToGoogleGroupSync\Sync\Async;
use GrotonSchool\BlackbaudToGoogleGroupSync\Sync\Progress;
use Monolog\Level;

require __DIR__ . '/../../../vendor/autoload.php';

session_start();

define('APP_NAME', 'Blackbaud to Google Group Sync');

$progress = new Progress();
$progress->setContext(['sync' => $progress->getId()]);
try {
    $progress->setStatus('start');
    $token = SKY::getToken($_SERVER, $_SESSION, $_GET, false);
    if (empty($token)) {
        echo json_encode(['error' => 'not authenticated']);
        exit();
    }

    Async::start(function () use ($progress) {
        echo json_encode([
            'id' => $progress->getId(),
            'message' => 'Sync started',
            'status' =>
                'https://' .
                $_SERVER['HTTP_HOST'] .
                '/progress?id=' .
                $progress->getId(),
        ]);
    });

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

        $bbProgress = new Progress([
            'name' => 'Blackbaud',
            'status' => 'Parsing Blackbaud group',
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($bbProgress);

        /** @var Member[] */
        $bbMembers = [];
        $bbProgress->setMax(count($response['results']['rows']));
        foreach ($response['results']['rows'] as $data) {
            try {
                $member = new Member($data);
                $bbMembers[$member->getEmail()] = $member;
                $bbProgress->setStatus($member->getEmail());
            } catch (Exception $e) {
                $progress->exception($e, ['data' => $data], Level::Warning);
            }
            $bbProgress->increment();
        }
        $bbProgress->setStatus('Parsed Blackbaud group', [
            'blackbaud-id' => $bbGroup->getId(),
            'name' => $bbGroup->getName(),
            'count' => count($bbMembers),
        ]);

        $purge = [];
        $gGroup = $directory->members->listMembers($bbGroup->getParamEmail());
        $gProgress = new Progress([
            'name' => 'Google',
            'max' => count($gGroup),
            'status' => 'Parsing Google group',
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($gProgress);
        $gProgress->setStatus('Parsed Google group information', [
            'blackbaud-id' => $bbGroup->getId(),
            'email' => $bbGroup->getParamEmail(),
            'count' => count($gGroup),
        ]);
        $gProgress->setMax(count($gGroup));
        foreach ($gGroup as $gMember) {
            /** @var DirectoryMember $gMember */
            $gProgress->setStatus($gMember->getEmail());
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
        $purgeProgress = new Progress([
            'name' => 'Purge',
            'max' => count($purge),
            'status' => 'Purging removed members',
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($purgeProgress);
        $purgeProgress->setMax(count($purge));
        foreach ($purge as $gMember) {
            $purgeProgress->setStatus("Removing '{$gMember->getEmail()}'");
            $directory->members->delete(
                $bbGroup->getParamEmail(),
                $gMember->getEmail()
            );
            $purgeProgress->increment();
        }
        $purgeProgress->setStatus('Out-dated members purged');

        $addProgress = new Progress([
            'name' => 'Add',
            'max' =>
                count($bbMembers) + ($bbGroup->getParamUpdateName() ? 1 : 0),
            'status' => 'Adding new members',
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($addProgress);
        $addProgress->setMax(
            count($bbMembers) + ($bbGroup->getParamUpdateName() ? 1 : 0)
        );
        foreach ($bbMembers as $bbMember) {
            try {
                $addProgress->setStatus("Adding {$bbMember->getEmail()}");
                $directory->members->insert(
                    $bbGroup->getParamEmail(),
                    new DirectoryMember([
                        'email' => $bbMember->getEmail(),
                    ])
                );
                $addProgress->increment();
            } catch (Exception $e) {
                $error = json_decode($e->getMessage(), true)['error'];
                $addProgress->log(
                    Level::Warning,
                    $error['message'],
                    array_merge(['email' => $bbMember->getEmail()], $error)
                );
            }
        }

        if ($bbGroup->getParamUpdateName()) {
            $gGroup = $directory->groups->get($bbGroup->getParamEmail());
            if ($gGroup->getName() != $bbGroup->getName()) {
                $addProgress->setStatus(
                    "Changing group name to '{$bbGroup->getName()}'"
                );
                $gGroup->setName($bbGroup->getName());
                $directory->groups->update($gGroup->getId(), $gGroup);
                $addProgress->increment();
            }
        }
        $addProgress->setStatus('New members added');

        $progress->removeChild($bbProgress);
        $progress->removeChild($gProgress);
        $progress->removeChild($purgeProgress);
        $progress->removeChild($addProgress);
        $progress->increment();
    }
    Async::result(fn() => $progress->setStatus('complete'));
} catch (Exception $e) {
    Async::error(fn() => $progress->exception($e));
}
