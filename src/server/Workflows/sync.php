<?php

use Google\Service\Directory;
use Google\Service\Directory\Group as DirectoryGroup;
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
define('Bb_PAGE_SIZE', 1000);

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
        fn ($list) => $list['category'] == APP_NAME
    );
    $progress->setMax(count($lists));
    foreach ($lists as $list) {
        $bbGroup = new Group($list);
        $progress->setStatus($bbGroup->getName());

        $page = 1;
        $response = null;
        $partial = null;
        do {
            $partial = $school->get("lists/advanced/{$list['id']}?page=$page");
            if (!$response) {
                $response = $partial;
            } else {
                array_push(
                    $response['results']['rows'],
                    $partial['results']['rows']
                );
            }
            $page++;
        } while (count($partial['results']['rows']) === Bb_PAGE_SIZE);

        $listProgress = new Progress([
            'name' => $bbGroup->getName(),
            'value' => 0,
            'max' => count($response['results']['rows']) * 2,
            'context' => [
                'sync' => $progress->getId(),
                'blackbaud-id' => $bbGroup->getId(),
                'google-email' => $bbGroup->getParamEmail(),
            ],
        ]);
        $progress->addChild($listProgress);
        $listProgress->setStatus('Parsing Blackbaud group');

        /** @var Member[] */
        $bbMembers = [];
        $emailMapping = $bbGroup->getParamMapEmailTo();
        foreach ($response['results']['rows'] as $data) {
            try {
                $member = new Member($data, $emailMapping);
                $bbMembers[$member->getEmail()] = $member;
            } catch (Exception $e) {
                $progress->exception($e, ['data' => $data], Level::Warning);
            }
            $listProgress->increment();
        }
        $listProgress->setStatus(
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
        $listProgress->setStatus('Parsing Google group');
        $listProgress->setMax(count($bbMembers) + count($gGroup));
        $deliverySettings = $bbGroup->getParamDeliverySettings();
        foreach ($gGroup as $gMember) {
            /** @var DirectoryMember $gMember */
            if (array_key_exists($gMember->getEmail(), $bbMembers)) {
                unset($bbMembers[$gMember->getEmail()]);
            /*
             * TODO #42
             *   Appears that listMembers() returns an array of Member-like
             *   objects, but not actually members. They are missing the
             *   `delivery_settings` field. Which means that to get the
             *   delivery settings for each member, each member would need to
             *   be individually queried per group, which is prohibitively
             *   resource expensive.
             */
                /*
            if ($gMember->getDeliverySettings() != $deliverySettings) {
                $oldDeliverySettings = $gMember->getDeliverySettings();
                $gMember->setDeliverySettings($deliverySettings);
                $gMember = $directory->members->update(
                    $bbGroup->getParamEmail(),
                    $gMember->getId(),
                    $gMember
                );
                $listProgress->setStatus(
                    "Updated {$gMember->email} delivery_settings from to '{$gMember->getDeliverySettings()}'"
                );
            }
            */
            } else {
                if (
                    ($gMember->getRole() !== 'OWNER' ||
                        ($bbGroup->getParamDangerouslyPurgeGoogleGroupOwners() &&
                            $gMember->getRole() === 'OWNER')) &&
                    ($gMember->getType() !== 'GROUP' ||
                        ($bbGroup->getParamDangerouslyPurgeGoogleSubgroups() &&
                            $gMember->getType() === 'GROUP'))
                ) {
                    array_push($remove, $gMember);
                }
            }
            $listProgress->increment();
        }
        $listProgress->setStatus(
            "Parsed '" .
                $bbGroup->getParamEmail() .
                "' (" .
                count($gGroup) .
                ' members)'
        );

        $errors = 0;
        $removed = 0;
        $added = 0;
        $listProgress->setMax($listProgress->getMax() + count($remove));
        foreach ($remove as $gMember) {
            $listProgress->setStatus("Removing '{$gMember->getEmail()}'", [
                'type' => $gMember->getType(),
                'role' => $gMember->getRole(),
            ]);
            $directory->members->delete(
                $bbGroup->getParamEmail(),
                $gMember->getEmail()
            );
            $listProgress->increment();
            $removed++;
        }
        $listProgress->setStatus(
            "Removed $removed members from '" . $bbGroup->getParamEmail() . "'"
        );

        $listProgress->setMax(
            $listProgress->getMax() +
                count($bbMembers) +
                ($bbGroup->getParamUpdateName() ? 1 : 0)
        );
        foreach ($bbMembers as $bbMember) {
            try {
                $listProgress->setStatus("Adding {$bbMember->getEmail()}");
                $directory->members->insert(
                    $bbGroup->getParamEmail(),
                    new DirectoryMember([
                        'email' => $bbMember->getEmail(),
                        'delivery_settings' => $deliverySettings,
                    ])
                );
                $listProgress->increment();
                $added++;
            } catch (Exception $e) {
                $error = json_decode($e->getMessage(), true)['error'];
                $listProgress->log(
                    Level::Warning,
                    $error['message'],
                    array_merge(['email' => $bbMember->getEmail()], $error)
                );
                $errors++;
            }
        }
        $listProgress->setStatus(
            "Added $added members to '" . $bbGroup->getParamEmail() . "'"
        );
        $listProgress->setStatus(
            "$errors error" .
                ($errors === 1 ? '' : 's') .
                " adding and removing members of '" .
                $bbGroup->getParamEmail() .
                "'"
        );

        if ($bbGroup->getParamUpdateName()) {
            $gGroup = $directory->groups->get($bbGroup->getParamEmail());
            if ($gGroup->getName() != $bbGroup->getName()) {
                $listProgress->setStatus(
                    "Changing group name to '{$bbGroup->getName()}'"
                );
                $gGroup->setName($bbGroup->getName());
                $directory->groups->update($gGroup->getId(), $gGroup);
                $listProgress->increment();
            }
        }

        $progress->increment();
        $progress->removeChild($listProgress);
    }
    Async::result(fn () => $progress->setStatus('complete'));
} catch (Exception $e) {
    Async::error(fn () => $progress->exception($e));
}
