import type { ErrorType } from "./types.ts";

/**
 * What the Advisor knows. This is sample knowledge: replace it with your own runbooks
 * and your own team names. It is plain data on purpose, so changing it needs no code.
 */
export interface KnowledgeBase {
  /** Steps to try, by kind of problem. */
  runbooks: Record<ErrorType, string[]>;
  /** Who to call, by service name. */
  owners: Record<string, string>;
  /** Used when a service is not in `owners`. */
  defaultOwner: string;
}

export const sampleKnowledge: KnowledgeBase = {
  runbooks: {
    memory: [
      "Find which process is using the memory (top, or container stats)",
      "Restart the leaking instance to restore service",
      "Compare memory use with the last deploy",
      "Raise the limit only after you know the cause",
    ],
    disk: [
      "Find the largest directories (du -sh)",
      "Clear old logs and temporary files",
      "Check that log rotation is running",
      "Add capacity if growth is steady",
    ],
    auth: [
      "Check whether the failing token or credential has expired",
      "Look for a deploy that changed authentication settings",
      "Check for a burst from one address, which can be an attack",
    ],
    rate_limit: [
      "Identify which client is over the limit",
      "Check for a retry storm or a loop in a caller",
      "Raise the limit only if the traffic is legitimate",
    ],
    connection: [
      "Check that the target service is up and accepting connections",
      "Compare connection pool usage with its limit",
      "Look for a recent change to network rules or credentials",
      "Restart the pool or the service if connections are stuck",
    ],
    timeout: [
      "Check the load and latency of the service being called",
      "Look for slow queries or a blocked dependency",
      "Check recent deploys",
      "Consider longer timeouts only after you find the cause",
    ],
    dependency: [
      "Find which upstream service failed first",
      "Check its health and its recent deploys",
      "Turn on fallbacks or shed load",
    ],
    exception: [
      "Find the first stack trace inside the incident window",
      "Check for a recent deploy and roll back if it matches",
      "Open a bug with the trace attached",
    ],
    unknown: [
      "Read the top messages by hand",
      "Add a pattern to the classifier so this kind of error is labelled next time",
    ],
  },
  owners: {
    "api-gateway": "platform team",
    checkout: "commerce team",
    "payments-api": "payments team",
    "db-primary": "data platform team",
    "auth-service": "identity team",
    "batch-worker": "data platform team",
  },
  defaultOwner: "the on call engineer",
};
