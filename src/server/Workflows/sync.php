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
$bbProgress = new Progress([
    'name' => 'Blackbaud',
]);
$progress->addChild($bbProgress);
$gProgress = new Progress([
    'name' => 'Google',
]);
$progress->addChild($gProgress);
$removeProgress = new Progress([
    'name' => 'Remove',
]);
$progress->addChild($removeProgress);
$addProgress = new Progress([
    'name' => 'Add',
]);
$progress->addChild($addProgress);

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

        $bbProgress->setContext([
            'sync' => $progress->getId(),
            'blackbaud-id' => $bbGroup->getId(),
            'google-email' => $bbGroup->getParamEmail(),
        ]);
        $bbProgress->setStatus('Parsing Blackbaud group');
        $bbProgress->setValue(0);
        $bbProgress->setMax(count($response['results']['rows']));

        /** @var Member[] */
        $bbMembers = [];
        foreach ($response['results']['rows'] as $data) {
            try {
                $member = new Member($data);
                $bbMembers[$member->getEmail()] = $member;
            } catch (Exception $e) {
                $progress->exception($e, ['data' => $data], Level::Warning);
            }
            $bbProgress->increment();
        }
        $bbProgress->setStatus(
            "Parsed '" .
                $bbGroup->getName() .
                "' (" .
                count($bbMembers) .
                ' members)'
        );

        $remove = [];
        $gGroup = [];
        $pageToken = null;
        do {
            $page = $directory->members->listMembers(
                $bbGroup->getParamEmail(),
                $pageToken ? ['pageToken' => $pageToken] : []
            );
            $pageToken = $page->getNextPageToken();
            $gGroup = array_merge($gGroup, $page->getMembers());
        } while ($pageToken);
        $gProgress->setContext([
            'sync' => $progress->getId(),
            'blackbaud-id' => $bbGroup->getId(),
            'google-email' => $bbGroup->getParamEmail(),
        ]);
        $gProgress->setStatus('Parsing Google group');
        $gProgress->setValue(0);
        $gProgress->setMax(count($gGroup));
        foreach ($gGroup as $gMember) {
            /** @var DirectoryMember $gMember */
            if (array_key_exists($gMember->getEmail(), $bbMembers)) {
                unset($bbMembers[$gMember->getEmail()]);
            } else {
                if (
                    $gMember->getRole() !== 'OWNER' ||
                    ($bbGroup->getParamDangerouslyPurgeGoogleGroupOwners() &&
                        $gMember->getRole() === 'OWNER')
                ) {
                    array_push($remove, $gMember);
                }
            }
            $gProgress->increment();
        }
        $gProgress->setStatus(
            "Parsed '" .
                $bbGroup->getParamEmail() .
                "' (" .
                count($gGroup) .
                ' members)'
        );

        $removeProgress->setContext([
            'sync' => $progress->getId(),
            'blackbaud-id' => $bbGroup->getId(),
            'google-email' => $bbGroup->getParamEmail(),
        ]);
        $removeProgress->setValue(0);
        $removeProgress->setMax(count($remove));
        foreach ($remove as $gMember) {
            $removeProgress->setStatus("Removing '{$gMember->getEmail()}'");
            $directory->members->delete(
                $bbGroup->getParamEmail(),
                $gMember->getEmail()
            );
            $removeProgress->increment();
        }
        $removeProgress->setStatus(
            'Removed ' .
                count($remove) .
                " members from '" .
                $bbGroup->getParamEmail() .
                "'"
        );

        $addProgress->setContext([
            'sync' => $progress->getId(),
            'blackbaud-id' => $bbGroup->getId(),
            'google-email' => $bbGroup->getParamEmail(),
        ]);
        $addProgress->setValue(0);
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
        $addProgress->setStatus(
            'Added ' .
                count($bbMembers) .
                " members to '" .
                $bbGroup->getParamEmail() .
                "'"
        );

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

        $bbProgress->reset();
        $gProgress->reset();
        $removeProgress->reset();
        $addProgress->reset();
        $progress->increment();
    }
    Async::result(fn() => $progress->setStatus('complete'));
} catch (Exception $e) {
    Async::error(fn() => $progress->exception($e));
}
