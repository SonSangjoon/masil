import Ajv from "ajv";
import { expect, test } from "@playwright/test";

import {
  getValidMasilActions,
  MASIL_TOOL_DESCRIPTORS,
  MASIL_TOOL_LABELS,
  MASIL_TOOL_LABELS_EN,
  MASIL_TOOL_NAMES,
  MASIL_WEBMCP_CONTRACT_HASH,
  MASIL_WEBMCP_CONTRACT_VERSION,
} from "../../src/features/webmcp/contract";

test("the versioned contract has 20 unique, labelled, valid tools", () => {
  const ajv = new Ajv({ strict: true });
  const names = MASIL_TOOL_DESCRIPTORS.map(({ name }) => name);

  expect(MASIL_WEBMCP_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(MASIL_WEBMCP_CONTRACT_HASH).toMatch(/^fnv1a:[a-f0-9]{8}$/);
  expect(names).toEqual([...MASIL_TOOL_NAMES]);
  expect(new Set(names).size).toBe(20);

  for (const descriptor of MASIL_TOOL_DESCRIPTORS) {
    expect(descriptor.description.length).toBeGreaterThan(20);
    expect(MASIL_TOOL_LABELS[descriptor.name]).toBeTruthy();
    expect(MASIL_TOOL_LABELS_EN[descriptor.name]).toBeTruthy();
    expect(() => ajv.compile(descriptor.inputSchema)).not.toThrow();
  }
});

test("valid actions are derived from state and never advertise unsafe shortcuts", () => {
  const home = getValidMasilActions({
    stage: "home",
    activity: null,
    hasCalligraphyReference: false,
    calligraphyInputMode: "idle",
    janggiTurn: "cho",
    supportDisclosureConfirmed: false,
    supportActionConfirmed: false,
  });
  expect(home).toContain("masil_open_activity");
  expect(home).not.toContain("masil_start_calligraphy_camera");
  expect(home).not.toContain("masil_create_local_handoff");

  const confirmedReview = getValidMasilActions({
    stage: "review",
    activity: "calligraphy",
    hasCalligraphyReference: true,
    calligraphyInputMode: "fallback",
    janggiTurn: "cho",
    supportDisclosureConfirmed: true,
    supportActionConfirmed: true,
  });
  expect(confirmedReview).toContain("masil_create_local_handoff");
  expect(confirmedReview).toContain("masil_return_to_activity");
});

test("every Janggi action carries an explicit person-confirmation value", () => {
  const descriptor = MASIL_TOOL_DESCRIPTORS.find(
    ({ name }) => name === "masil_move_janggi_piece",
  );
  expect(descriptor).toBeTruthy();
  const validate = new Ajv({ strict: true }).compile(descriptor!.inputSchema);

  expect(validate({ action: "move", actor: "person" })).toBe(false);
  expect(
    validate({ action: "move", actor: "person", personConfirmed: true }),
  ).toBe(true);
  expect(
    validate({ action: "move", actor: "agent", personConfirmed: false }),
  ).toBe(true);
});
