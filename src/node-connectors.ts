import { readFile } from "node:fs/promises";
import { checkSize, ConnectorError, type Connector } from "./connectors.ts";

/** Reads a file from disk. Only for the terminal: a web page cannot read your disk, so it uses file upload instead. */
export const fileConnector: Connector = {
  name: "file",
  description: "Reads a log file from your computer.",
  args: [{ name: "path", help: "Path to the log file" }],
  read: async ({ path }) => {
    try {
      return checkSize(await readFile(path ?? "", "utf8"), path ?? "The file");
    } catch (e) {
      if (e instanceof ConnectorError) throw e;
      throw new ConnectorError(`Could not read "${path ?? ""}": ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
