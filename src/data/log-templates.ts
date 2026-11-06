import type { ErrorType } from "../incident/types.ts";

/**
 * Phrasings of log messages, for each kind of problem, split in two:
 *
 *   TRAIN     the wordings the model learns from
 *   HELDOUT   different wordings, never used for training, to test whether it generalises
 *
 * The slots ({svc}, {host}, {path}, {user}, {id}, {n}) are filled with varied values by log-data.ts.
 * An honest test needs the split: scoring a model on the phrasings it trained on only shows memory.
 */
export type Templates = Record<ErrorType, string[]>;

export const TRAIN: Templates = {
  memory: [
    "out of memory: killed process {n} ({svc})",
    "java.lang.OutOfMemoryError: Java heap space",
    "container {svc} exceeded memory limit of {n}Mi",
    "cannot allocate memory for {svc} worker",
    "heap usage at {n}% in {svc}, GC overhead limit exceeded",
    "OOM killer terminated {svc}",
    "memory allocation failed: requested {n} bytes",
    "{svc} is using too much memory ({n} MB), restarting",
  ],
  disk: [
    "no space left on device writing {path}",
    "disk usage {n}% on {path}",
    "failed to write {path}: disk full",
    "disk quota exceeded for user {user}",
    "filesystem {path} is full, cannot create file",
    "write error ENOSPC on {path}",
    "free space on {path} below {n}%",
    "{svc} cannot append to {path}: no space left",
  ],
  auth: [
    "invalid token for user {user}",
    "authentication failed for user {user}",
    "401 Unauthorized from {svc}",
    "403 Forbidden: access denied to {path}",
    "invalid credentials supplied by {host}",
    "access denied for {user} on {path}",
    "failed login for {user} from {host}",
    "invalid password for user {user}",
  ],
  rate_limit: [
    "rate limit exceeded for client {id}",
    "429 Too Many Requests from {host}",
    "request throttled: {n} requests in {n}s",
    "quota exceeded for api key {id}",
    "too many requests, retry after {n}s",
    "{svc} is throttling traffic from {host}",
    "rate limiter rejected {n} requests",
    "client {id} hit the request limit",
  ],
  connection: [
    "connection refused by {host}:{n}",
    "connection pool exhausted: {n}/{n} connections in use",
    "connection reset by peer from {host}",
    "cannot connect to {host}",
    "ECONNREFUSED {host}:{n}",
    "no route to host {host}",
    "connection closed unexpectedly by {svc}",
    "network unreachable while contacting {host}",
  ],
  timeout: [
    "timeout connecting to {host} after {n}s",
    "request timed out after {n}ms",
    "deadline exceeded calling {svc}",
    "read timeout from {host}",
    "operation timed out ({n}s)",
    "{svc} did not respond within {n}s",
    "timed out waiting for {svc}",
    "gateway timeout after {n}ms on {path}",
  ],
  dependency: [
    "upstream {svc} returned {n} Bad Gateway",
    "503 Service Unavailable from {svc}",
    "dependency {svc} is down",
    "bad gateway while proxying to {svc}",
    "{svc} reported unhealthy, removing from pool",
    "upstream error: {svc} returned 502",
    "service unavailable: {svc}",
    "502 from upstream {svc} for {path}",
  ],
  exception: [
    "NullPointerException at {svc}.handle",
    "unhandled exception in {svc}: index out of range",
    "Traceback (most recent call last) in {svc}",
    "panic: runtime error: nil pointer dereference",
    "segmentation fault in {svc}",
    "uncaught TypeError: cannot read properties of undefined",
    "stack trace: {svc} threw {id}",
    "unexpected exception while processing order {id}",
  ],
  unknown: [
    "failed to parse config file {path}: invalid yaml",
    "cache miss ratio is {n}%",
    "deprecated API called by {svc}",
    "feature flag {id} not found",
    "retrying job {id} (attempt {n})",
    "certificate expires in {n} days",
    "unexpected response format from {svc}",
    "schema migration {id} skipped",
  ],
};

export const HELDOUT: Templates = {
  memory: [
    "Worker killed: signal 9 (out of memory)",
    "JVM ran out of heap space while handling request",
    "mmap failed: Cannot allocate memory",
    "resident memory {n}MB over the configured ceiling for {svc}",
    "the kernel reclaimed {svc} because memory was exhausted",
  ],
  disk: [
    "Unable to extend file: the volume is out of space",
    "disk almost full ({n} GB free of {n} GB)",
    "could not write temp file in {path}: device has no room",
    "storage limit reached on {path}",
    "log rotation failed because the disk is full",
  ],
  auth: [
    "JWT signature could not be verified",
    "login rejected: bad username or password",
    "the API key presented is not valid",
    "session expired, please sign in again",
    "user {user} is not permitted to perform this action",
  ],
  rate_limit: [
    "slow down: you are sending requests too quickly",
    "request budget for this minute is used up",
    "burst limit reached, request dropped",
    "API calls are capped at {n} per second",
    "throttle engaged for tenant {id}",
  ],
  connection: [
    "failed to open a socket to {host}",
    "all database connections are taken",
    "the remote end hung up without a reply",
    "peer {host} dropped the link",
    "could not reach {host} on port {n}",
  ],
  timeout: [
    "no reply from {svc} in time",
    "the call to {host} took too long and was abandoned",
    "waited {n} seconds for a response and gave up",
    "slow response: exceeded the {n} ms limit",
    "TimeoutError: task {id} did not finish",
  ],
  dependency: [
    "backend {svc} is not healthy",
    "downstream service failed to serve the request",
    "got an error response from the {svc} backend",
    "circuit open for {svc}, calls are being rejected",
    "the service behind {path} is unavailable",
  ],
  exception: [
    "the process crashed with a fatal error",
    "assertion failed: invariant violated in {svc}",
    "ValueError raised while parsing request body",
    "core dumped",
    "unexpected failure in handler for {path}",
  ],
  unknown: [
    "license check will expire soon",
    "clock drift of {n}ms detected",
    "queue depth is {n}, above the soft limit",
    "metrics exporter is lagging",
    "warning: option {id} is ignored in this mode",
  ],
};
