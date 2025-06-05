<?php

namespace GrotonSchool\BlackbaudToGoogleGroupSync\Sync;

use Exception;
use JsonSerializable;
use Google\AppEngine\Api\Memcache\Memcached;
use Google\Cloud\Logging\LoggingClient;
use Monolog\Handler\PsrHandler;
use Monolog\Level;
use Monolog\Logger;
use Ramsey\Uuid\Uuid;

class Progress implements JsonSerializable
{
    private ?string $id = null;
    private ?string $name = null;
    private ?int $value = null;
    private ?int $max = null;
    private ?string $status = null;
    private array $defaultContext = [];

    private array $children = [];

    private Memcached $cache;
    private Logger $logger;

    public function __construct(array $params = [])
    {
        $this->cache = new Memcached();
        $loggerName = 'blackbaud-to-google-group-sync';
        $logger = LoggingClient::psrBatchLogger($loggerName);
        $this->logger = new Logger($loggerName);
        $this->logger->pushHandler(new PsrHandler($logger));
        $this->reset($params);
    }

    public function reset(array $params = [])
    {
        $this->value = null;
        $this->max = null;
        $this->status = null;
        $this->defaultContext = [];
        foreach ($params as $key => $value) {
            switch ($key) {
                case 'name':
                case 'value':
                case 'max':
                case 'status':
                    $this->$key = $value;
                    break;
                case 'context':
                    $this->defaultContext = $value;
                    break;
                default:
                    break;
            }
        }
        if (empty($this->id)) {
            $this->id = Uuid::uuid7();
        }
        if ($this->max && !$this->value) {
            $this->value = 0;
        }
        $this->update();
    }

    private function update()
    {
        $this->cache->set($this->id, json_encode($this));
    }

    private function set(
        string $key,
        $value,
        ?array $context = [],
        ?Level $level = Level::Info
    ) {
        $this->$key = $value;
        $this->update();
        if ($level) {
            $this->logger->log(
                $level,
                $key == 'status' ? $value : "`$key` = '$value'",
                array_merge($this->defaultContext, $context ?? [])
            );
        }
    }

    public function getId()
    {
        return $this->id;
    }

    public function getName()
    {
        return $this->name;
    }

    public function setValue(
        int $value,
        array $context = [],
        Level $level = null
    ) {
        $this->set('value', $value, $context, $level);
    }

    public function increment(?array $context = [], ?Level $level = null)
    {
        $this->setValue($this->value + 1, $context, $level);
    }

    public function getMax()
    {
        return $this->max;
    }

    public function setMax(int $max, ?array $context = [], ?Level $level = null)
    {
        if ($this->value === null) {
            $this->value = 0;
        }
        $this->set('max', $max, $context, $level);
    }

    public function setStatus(
        string $status,
        ?array $context = [],
        ?Level $level = Level::Info
    ) {
        $this->set('status', $status, $context, $level);
    }

    public function setContext(array $context)
    {
        $this->defaultContext = $context;
    }

    public function addChild(Progress $child)
    {
        $this->children[$child->id] = $child;
        $this->update();
    }

    public function removeChild(Progress $child)
    {
        unset($this->children[$child->id]);
        $this->update();
    }

    public function log(Level $level, string $message, ?array $context = [])
    {
        $this->logger->log(
            $level,
            $message,
            array_merge($this->defaultContext, $context ?? [])
        );
    }

    public function exception(
        Exception $e,
        ?array $context = [],
        Level $level = Level::Error
    ) {
        $this->logger->log(
            $level,
            $e->getMessage(),
            array_merge(
                $this->defaultContext,
                [
                    'isError' => true,
                    'code' => $e->getCode(),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                    'trace' => $e->getTraceAsString(),
                ],
                $context ?? []
            )
        );
    }

    public function jsonSerialize(): mixed
    {
        $arr = [];
        foreach ($this as $key => $value) {
            switch ($key) {
                case 'children':
                    if (!empty($value)) {
                        $arr[$key] = $value;
                    }
                    break;
                case 'defaultContext':
                case 'cache':
                case 'logger':
                    break;
                default:
                    if ($value !== null) {
                        $arr[$key] = $value;
                    }
            }
        }
        return $arr;
    }
}
