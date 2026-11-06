import { generateSampleLog } from "./sample-log.ts";

/**
 * Connectors: how data gets into the team.
 *
 * A connector has a name, a description, named arguments, and a read function that returns text.
 * That is the whole contract, the same shape as a tool in an agent and as a tool served over MCP
 * (the Model Context Protocol). To connect a new source, write one of these and pass it in.
 *
 *   const myConnector: Connector = {
 *     name: "my-source",
 *     description: "Reads logs from somewhere we have not thought of.",
 *     args: [{ name: "where", help: "Where to read from" }],
 *     read: async ({ where }) => "...text...",
 *   };
 */
export interface ConnectorArg {
  name: string;
  help: string;
}

export interface Connector {
  name: string;
  description: string;
  args: ConnectorArg[];
  read(args: Record<string, string>): Promise<string>;
}

/** Something the user can fix, with a message that says how. */
export class ConnectorError extends Error {}

/** Big enough for a long log, small enough that nothing can hang the page. */
export const MAX_CHARS = 1_000_000;

export function checkSize(text: string, source: string): string {
  if (text.length > MAX_CHARS) {
    throw new ConnectorError(`${source} is ${text.length.toLocaleString()} characters, more than the ${MAX_CHARS.toLocaleString()} limit. Try a smaller slice of the log.`);
  }
  return text;
}

/** Text you already have: pasted into a box, or read from a file the user picked in the browser. */
export const textConnector: Connector = {
  name: "text",
  description: "Text you paste in, or the contents of a file you choose.",
  args: [{ name: "text", help: "The log text" }],
  read: async ({ text }) => checkSize(text ?? "", "The text"),
};

/** A made up incident, so there is something to try before connecting your own data. */
export const sampleConnector: Connector = {
  name: "sample",
  description: "A built in example: a database problem that spreads through four services.",
  args: [],
  read: async () => generateSampleLog(),
};

/**
 * Fetch text from a web address. In a browser this only works when the other site allows it
 * (CORS), and many do not, so the error says what to do instead. `fetchImpl` is a parameter so
 * tests can pass a fake.
 */
export function createUrlConnector(fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a), timeoutMs = 10_000): Connector {
  return {
    name: "url",
    description: "Fetches text from a web address (http or https).",
    args: [{ name: "url", help: "The address of a text or log file" }],
    read: async ({ url }) => {
      let parsed: URL;
      try {
        parsed = new URL(url ?? "");
      } catch {
        throw new ConnectorError(`"${url ?? ""}" is not a web address. Start it with https://`);
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new ConnectorError(`Only http and https addresses are allowed, not ${parsed.protocol}`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(parsed, { signal: controller.signal });
        if (!res.ok) throw new ConnectorError(`${parsed.host} answered ${res.status}.`);
        return checkSize(await res.text(), parsed.host);
      } catch (e) {
        if (e instanceof ConnectorError) throw e;
        const inBrowser = typeof document !== "undefined";
        throw new ConnectorError(
          controller.signal.aborted
            ? `${parsed.host} did not answer within ${timeoutMs / 1000} seconds.`
            : inBrowser
              ? `Could not fetch ${parsed.host}. Many sites do not allow web pages to read them (CORS). Download the file and use "paste or upload" instead.`
              : `Could not fetch ${parsed.host}: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const urlConnector = createUrlConnector();

/** The connectors that work everywhere, browser and terminal. */
export const builtInConnectors: Connector[] = [sampleConnector, textConnector, urlConnector];

export async function connect(connectors: Connector[], name: string, args: Record<string, string> = {}): Promise<string> {
  const connector = connectors.find((c) => c.name === name);
  if (!connector) throw new ConnectorError(`No connector called "${name}". Available: ${connectors.map((c) => c.name).join(", ")}`);
  return connector.read(args);
}
