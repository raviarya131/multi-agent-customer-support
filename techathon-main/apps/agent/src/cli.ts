// CLI for working on the agent independently — no API/frontend needed.
//
//   npm run pipeline -- "App crashes after login and I was charged twice"
//     → runs the full pipeline, prints the resulting JSON.
//
//   npm run step -- <step> ["message"]
//     steps: guard | classify | sentiment | decompose | investigate
//
//   npm run agent -- <domain> ["message"]
//     domain: technical | billing | policy
//     → runs ONE specialist agent in isolation (pure function).
import type { AgentDomain, SubProblem } from "./contracts/types";
import { buildInput, runPipeline } from "./run";
import { runGuard } from "./steps/guard";
import { runClassifier } from "./steps/classifier";
import { runSentiment } from "./steps/sentiment";
import { runDecomposer } from "./steps/decomposer";
import { runOrchestrator } from "./steps/orchestrator";
import { getAgent } from "./agents/registry";

const DEFAULT_MSG = "App crashes after login and I was charged twice";

function out(label: string, data: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);

  if (mode === "step") {
    const step = rest[0];
    const message = rest.slice(1).join(" ") || DEFAULT_MSG;
    switch (step) {
      case "guard":
        return out("guard", runGuard(message));
      case "classify":
        return out("classify", await runClassifier(message));
      case "sentiment":
        return out("sentiment", runSentiment(message));
      case "decompose":
        return out("decompose", await runDecomposer(message, await runClassifier(message)));
      case "investigate": {
        const { subProblems: subs } = await runDecomposer(message, await runClassifier(message));
        return out("investigate", await runOrchestrator(subs, message, []));
      }
      default:
        console.log("Unknown step. Use: guard | classify | sentiment | decompose | investigate");
        process.exit(1);
    }
    return;
  }

  if (mode === "agent") {
    const domain = (rest[0] as AgentDomain) || "billing";
    const message = rest.slice(1).join(" ") || DEFAULT_MSG;
    const sub: SubProblem = { id: "SP-1", domain, description: message };
    return out(`${domain} agent`, await getAgent(domain).run(sub, { message, history: [] }));
  }

  // default: full pipeline
  const message = (mode === "pipeline" ? rest : [mode, ...rest]).filter(Boolean).join(" ") || DEFAULT_MSG;
  out("pipeline result", await runPipeline(buildInput({ message })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
