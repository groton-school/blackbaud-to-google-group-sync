<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Blackbaud;

use Exception;

class Group
{
    private string $id;

    private string $name;

    private array $params = [];

    private array $data;

    public function __construct(array $data)
    {
        $this->id = $data['id'];
        $this->name = $data['name'];
        $this->data = $data;
        if (preg_match('/(\{.*\})/', $data['description'], $matches)) {
            $this->params = json_decode($matches[1], true);
        }
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getParam(string $name, $default = null)
    {
        if (isset($this->params[$name])) {
            return $this->params[$name];
        } else {
            if ($default instanceof Exception) {
                throw $default;
            } else {
                return $default;
            }
        }
    }

    /**
     * @return string
     * @throws Exception if no email configured
     */
    public function getParamEmail(): string
    {
        return $this->getParam('email', new Exception('no email configured'));
    }

    public function getParamUpdateName(): bool
    {
        return $this->getParam('update-name', true);
    }

    public function getParamMapEmailTo(): string
    {
        return $this->getParam('map-email-to', 'E-Mail');
    }

    public function getParamDeliverySettings(): string
    {
        return $this->getParam('delivery-settings', 'ALL_MAIL');
    }

    public function getParamDangerouslyPurgeGoogleGroupOwners(): bool
    {
        return $this->getParam('dangerously-purge-google-group-owners', false);
    }

    public function getParamDangerouslyPurgeGoogleSubgroups(): bool
    {
        return $this->getParam('dangerously-purge-google-subgroups', false);
    }
}
