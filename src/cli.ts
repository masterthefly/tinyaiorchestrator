import { builtInConnectors, connect, ConnectorError } from "./connectors.ts";
import { fileConnector } from "./node-connectors.ts";
import { describeTrace, renderReport } from "./report.ts";
import { triage } from "./incident/team.ts";

const [source = "sample", value] = process.argv.slice(2);
const connectors = [...builtInConnectors, fileConnector];

const usage = `usage: npm run triage -- sample
       npm run triage -- file <path to a log file>
       npm run triage -- url <https address of a log file>`;

try {
  const args = source === "file" ? { path: value ?? "" } : source === "url" ? { url: value ?? "" } : {};
  const raw = await connect(connectors, source, args);
  const outcome = triage(raw);
  console.log("THE TEAM AT WORK");
  for (const line of describeTrace(outcome)) console.log(line);
  console.log("\nTHE REPORT");
  for (const line of renderReport(outcome.state)) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
} catch (e) {
  if (e instanceof ConnectorError) {
    console.error(`${e.message}\n\n${usage}`);
    process.exitCode = 2;
  } else {
    throw e;
  }
}
