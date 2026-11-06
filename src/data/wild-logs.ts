import type { ErrorType } from "../incident/types.ts";

/**
 * The "wild" test set: log lines in the styles real systems produce (nginx, Postgres, Java, Go,
 * Kubernetes, SSH and so on), written by hand and used for NOTHING except testing. They never
 * appear in the training data, and the rules were not adjusted to fit them.
 *
 * Honest limits: one person (the author) wrote the rules, the templates and this list, and labelled
 * every line by judgement. A few labels are arguable. There is no real production data here.
 * Treat results on this set as a rough guide, not a verdict.
 */
export const WILD: [string, ErrorType][] = [
  // memory
  ["Out of memory: Killed process 4121 (java) total-vm:8123456kB", "memory"],
  ["OOMKilled: container exceeded its memory limit", "memory"],
  ["java.lang.OutOfMemoryError: GC overhead limit exceeded", "memory"],
  ["FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory", "memory"],
  ["MemoryError: unable to allocate array with shape (20000, 20000)", "memory"],
  ["Cannot allocate memory: fork failed", "memory"],
  ["oom-kill:constraint=CONSTRAINT_MEMCG,task=worker", "memory"],
  ["runtime: out of memory: cannot allocate 4194304-byte block", "memory"],
  // disk
  ["ERROR: could not extend file base/16384/2619: No space left on device", "disk"],
  ["OSError: [Errno 28] No space left on device", "disk"],
  ["df: /var/lib/docker is at 98% capacity", "disk"],
  ["Disk quota exceeded", "disk"],
  ["write /var/log/syslog: no space left on device", "disk"],
  ["journal: Failed to write entry, ignoring: disk is full", "disk"],
  ["tar: Error writing to archive: filesystem is full", "disk"],
  ["Insufficient disk space: 120MB free, 2GB required", "disk"],
  // auth
  ["Permission denied (publickey,password).", "auth"],
  ['FATAL: password authentication failed for user "app"', "auth"],
  ["HTTP 401: Unauthorized", "auth"],
  ["AccessDenied: User is not authorized to perform s3:GetObject", "auth"],
  ["error: invalid_grant: token has been expired or revoked", "auth"],
  ["Failed password for invalid user admin from 203.0.113.7 port 52112 ssh2", "auth"],
  ["Authentication failed: bad credentials", "auth"],
  ["403 Forbidden", "auth"],
  // rate_limit
  ["HTTP 429 Too Many Requests", "rate_limit"],
  ["ThrottlingException: Rate exceeded", "rate_limit"],
  ["Rate limit reached for requests, retry in 20s", "rate_limit"],
  ['limit_req: too many requests, excess: 12.340 by zone "api"', "rate_limit"],
  ["RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Read requests'", "rate_limit"],
  ["You have exceeded the API rate limit", "rate_limit"],
  ["TooManyRequestsException: request rate exceeded", "rate_limit"],
  ["Client sent too many requests in a short time", "rate_limit"],
  // connection
  ["dial tcp 10.0.0.5:5432: connect: connection refused", "connection"],
  ["FATAL: remaining connection slots are reserved for non-replication superuser connections", "connection"],
  ["redis.exceptions.ConnectionError: Error 111 connecting to cache:6379. Connection refused.", "connection"],
  ["java.net.ConnectException: Connection refused (Connection refused)", "connection"],
  ["read tcp 10.0.2.3:443: connection reset by peer", "connection"],
  ["Too many connections", "connection"],
  ["getaddrinfo ENOTFOUND api.internal", "connection"],
  ["Network is unreachable", "connection"],
  // timeout
  ["upstream timed out (110: Connection timed out) while reading response header from upstream", "timeout"],
  ["java.net.SocketTimeoutException: Read timed out", "timeout"],
  ["context deadline exceeded", "timeout"],
  ["Gateway Timeout", "timeout"],
  ["504 Gateway Time-out", "timeout"],
  ["TimeoutError: Navigation timeout of 30000 ms exceeded", "timeout"],
  ["ETIMEDOUT", "timeout"],
  ["Request timeout after 15 seconds", "timeout"],
  // dependency
  ["502 Bad Gateway", "dependency"],
  ["503 Service Unavailable", "dependency"],
  ["no healthy upstream", "dependency"],
  ["Service Unavailable: the server is temporarily unable to handle the request", "dependency"],
  ["failed to call payment-service: dependency unavailable", "dependency"],
  ["Bad Gateway: backend returned an invalid response", "dependency"],
  ["health check failed for target group, marking unhealthy", "dependency"],
  ["upstream service returned an error response", "dependency"],
  // exception
  ["Traceback (most recent call last):", "exception"],
  ["java.lang.NullPointerException", "exception"],
  ["panic: runtime error: index out of range [5] with length 3", "exception"],
  ["Uncaught TypeError: Cannot read properties of undefined (reading 'id')", "exception"],
  ["Segmentation fault (core dumped)", "exception"],
  ["System.InvalidOperationException: Sequence contains no elements", "exception"],
  ["Unhandled promise rejection: Error: invalid state", "exception"],
  ['Exception in thread "main" java.lang.IllegalStateException', "exception"],
  // unknown
  ["Failed to parse configuration: unexpected token at line 14", "unknown"],
  ["Certificate will expire in 6 days", "unknown"],
  ["Cache hit ratio dropped below 40%", "unknown"],
  ["Deprecated: the 'legacy' flag will be removed in v3", "unknown"],
  ["Job 8812 retried 3 times", "unknown"],
  ["Unexpected content type: text/html", "unknown"],
  ["Clock skew detected: 1.8s", "unknown"],
  ["Config key 'max_workers' is not recognised", "unknown"],
];
