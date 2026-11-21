import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hostLogReasonMessage } from "../../src/lib/hostLogErrors";

describe("hostLogReasonMessage", () => {
  test("maps known agent and file error reasons to user-friendly messages", () => {
    assert.match(hostLogReasonMessage("agent_unreachable"), /Can't reach the log agent/i);
    assert.match(hostLogReasonMessage("agent_auth"), /rejected ContainerYard's token/i);
    assert.match(hostLogReasonMessage("agent_logs_off"), /Logs are off/i);
    assert.match(hostLogReasonMessage("agent_rate_limited"), /rate-limited/i);
    assert.match(hostLogReasonMessage("not_readable"), /not readable/i);
  });

  test("falls back to server message or generic copy for unknown reasons", () => {
    assert.equal(hostLogReasonMessage("something_else", "Custom server note"), "Custom server note");
    assert.match(hostLogReasonMessage(undefined), /unavailable/i);
    assert.match(hostLogReasonMessage("constructor"), /unavailable/i);
  });
});
