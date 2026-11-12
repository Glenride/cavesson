// Pure gate/rules core tests. No DOM, no UI SDK imports: the core is
// driven directly with injected timestamps and queue ids.
import { describe, expect, test } from "vitest"
import {
  money, createVaultState, evaluateGate, detailText, submitProposal,
  decideQueued, lintRules, saveRules, fileLintReceipt, approvePendingVendor,
  removePendingVendor, addPendingVendor, runWatcherCheck, scenarioSteps,
  applyScenario, authenticateVoice, ownerHalt, ownerResume, cutPower,
  restorePower, attemptAgentSharedEdit, saveSharedFile, fileCorrection,
  buildExport, buildCopyText, filterReceipts, detailOptionsFor,
  QUICK_PROPOSALS, demoPlan, runDemoPlan, addReceipt,
} from "../dashboard.js"

const TS = "11/12/2026, 4:00:00 PM"
const pay40 = { agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 40, desc: "Monthly research-tool licence" }

describe("defaults", () => {
  test("fresh state matches the $500 budget / $50 auto-allow structure", () => {
    const s = createVaultState()
    expect(s.budget).toBe(500)
    expect(s.autoAllow).toBe(50)
    expect(s.ceiling).toBe(150)
    expect(s.dailyCap).toBe(200)
    expect(s.version).toBe(1)
    expect(s.spent).toBe(0)
    expect(s.frozen).toBe(false)
    expect(s.agents).toHaveLength(4)
    expect(s.pendingVendors).toEqual(["Freelance Hub", "NewData Corp."])
  })
})

describe("gate verdicts", () => {
  test("$40 research purchase is ALLOWED with the within-rules check", () => {
    const s = createVaultState()
    const res = evaluateGate(s, pay40)
    expect(res.decision).toBe("ALLOWED")
    expect(res.checks).toEqual([["ALLOWED", "Inside the allowlist, the ceiling, the budget, and the daily cap."]])
  })
  test("$75 research purchase is PENDING naming the auto-allow limit", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, amount: 75 })
    expect(res.decision).toBe("PENDING")
    expect(res.checks[0][1]).toContain("$75.00 is above the auto-allow limit of $50.00")
  })
  test("$200 hire is STOPPED naming the role rule", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { agentId: "researcher", action: "hire", vendor: "Freelance Hub", detail: "Contractor", amount: 200, desc: "x" })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toBe("Role \u201CContractor\u201D is not on the hire allowlist.")
  })
  test("frozen vault stops everything", () => {
    const s = createVaultState()
    s.frozen = true
    const res = evaluateGate(s, pay40)
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("Vault is frozen")
  })
  test("halted vault stops everything", () => {
    const s = createVaultState()
    s.halted = true
    expect(evaluateGate(s, pay40).decision).toBe("STOPPED")
  })
  test("shadow instance with no identity is stopped at Layer 3", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, agentId: "shadow" })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("Layer 3 gate: no Vault identity")
  })
  test("deny list wins, case-insensitive", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, vendor: "ads broker ltd." })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("on the deny list")
  })
  test("pending vendor stays pending", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, vendor: "Freelance Hub" })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("is pending")
  })
  test("unlisted vendor is stopped", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, vendor: "Unknown Vendor LLC", amount: 120 })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("is not on the pay allowlist")
  })
  test("off-allowlist category is stopped", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, detail: "Subscriptions", amount: 75 })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("is not on the pay allowlist")
  })
  test("off-allowlist document type is stopped", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { agentId: "researcher", action: "sign", vendor: "ResearchTools Co.", detail: "Loan agreement", amount: 10, desc: "x" })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("is not on the sign allowlist")
  })
  test("amount over the ceiling is stopped", () => {
    const s = createVaultState()
    const res = evaluateGate(s, { ...pay40, amount: 151 })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("exceeds the approval ceiling of $150.00")
  })
  test("spending past the budget is stopped", () => {
    const s = createVaultState()
    s.spent = 480
    const res = evaluateGate(s, { ...pay40, amount: 40 })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("past the $500.00 budget")
  })
  test("spending past the daily cap is stopped", () => {
    const s = createVaultState()
    s.todaySpent = 190
    const res = evaluateGate(s, { ...pay40, amount: 40 })
    expect(res.decision).toBe("STOPPED")
    expect(res.checks[0][1]).toContain("exceed the daily cap of $200.00")
  })
  test("check order: identity beats allowlist, allowlist beats ceiling", () => {
    const s = createVaultState()
    expect(evaluateGate(s, { ...pay40, agentId: "shadow", amount: 999 }).checks[0][1]).toContain("Layer 3 gate")
    expect(evaluateGate(s, { ...pay40, detail: "Subscriptions", amount: 999 }).checks[0][1]).toContain("pay allowlist")
  })
  test("detailText labels pay/hire/sign", () => {
    expect(detailText({ action: "pay", detail: "Research tools" })).toBe("Pay · Research tools")
    expect(detailText({ action: "hire", detail: "Editor" })).toBe("Hire · Editor")
    expect(detailText({ action: "sign", detail: "Invoice approval" })).toBe("Sign · Invoice approval")
  })
})

describe("submit + receipts", () => {
  test("ALLOWED executes, moves money, and files a Vault-rules receipt naming the version", () => {
    const s = createVaultState()
    const res = submitProposal(s, { ...pay40 }, { ts: TS })
    expect(res.decision).toBe("ALLOWED")
    expect(s.spent).toBe(40)
    expect(s.todaySpent).toBe(40)
    expect(s.agents[0].spent).toBe(40)
    const r = s.receipts[0]
    expect(r.id).toBe("CV-0001")
    expect(r.decision).toBe("ALLOWED")
    expect(r.decider).toBe("Vault rules (v1)")
    expect(r.ruleVersion).toBe(1)
    expect(r.proposer).toBe("Researcher")
    expect(r.action).toBe("Pay · Research tools")
    expect(r.amount).toBe(40)
    expect(r.vendor).toBe("ResearchTools Co.")
    expect(r.reason).toBe("Within house rules. Monthly research-tool licence")
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(r.corrects).toBeNull()
  })
  test("STOPPED files a receipt and moves no money", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, detail: "Subscriptions", amount: 75 }, { ts: TS })
    expect(s.spent).toBe(0)
    expect(s.receipts[0].decision).toBe("STOPPED")
    expect(s.receipts[0].reason).toContain("is not on the pay allowlist")
  })
  test("PENDING queues with a qid and files an awaiting-human receipt", () => {
    const s = createVaultState()
    const res = submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    expect(res.decision).toBe("PENDING")
    expect(res.qid).toBe("Q1")
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0].qid).toBe("Q1")
    expect(s.receipts[0].decider).toBe("— awaiting human —")
    expect(s.receipts[0].decision).toBe("PENDING")
    expect(s.spent).toBe(0)
  })
  test("receipts are append-only: new entries unshift, old entries keep id and version", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40 }, { ts: TS })
    saveRules(s, { budget: 600, autoAllow: 50, ceiling: 150, dailyCap: 200, payCats: s.payCats, vendors: s.vendors, deny: s.deny, hireRoles: s.hireRoles, signTypes: s.signTypes }, TS)
    submitProposal(s, { ...pay40 }, { ts: TS })
    expect(s.receipts.map((r) => r.id)).toEqual(["CV-0003", "CV-0002", "CV-0001"])
    expect(s.receipts[2].ruleVersion).toBe(1)
    expect(s.receipts[0].ruleVersion).toBe(2)
  })
  test("receipt hash is deterministic for identical fields", () => {
    const a = createVaultState()
    const b = createVaultState()
    const ra = addReceipt(a, { proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Rule change", reason: "x" }, TS)
    const rb = addReceipt(b, { proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Rule change", reason: "x" }, TS)
    expect(ra.hash).toBe(rb.hash)
  })
})

describe("queue approve/decline", () => {
  test("approve executes with the Human as decider and removes the item", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    const res = decideQueued(s, "Q1", true, TS)
    expect(res).toEqual({ found: true, decision: "ALLOWED" })
    expect(s.queue).toHaveLength(0)
    expect(s.spent).toBe(75)
    expect(s.receipts[0].decider).toBe("Human")
    expect(s.receipts[0].reason).toBe("Human approved. Monthly research-tool licence")
  })
  test("approve re-checks: a rule change that stops it files a STOPPED receipt", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    s.deny.push("ResearchTools Co.")
    const res = decideQueued(s, "Q1", true, TS)
    expect(res.decision).toBe("STOPPED")
    expect(s.spent).toBe(0)
    expect(s.receipts[0].reason).toContain("Human approved, but re-check stopped it:")
  })
  test("decline is final: receipt filed, item gone, re-decide is a no-op", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    const res = decideQueued(s, "Q1", false, TS)
    expect(res).toEqual({ found: true, decision: "STOPPED" })
    expect(s.queue).toHaveLength(0)
    expect(s.spent).toBe(0)
    expect(s.receipts[0].reason).toBe("Human declined. Monthly research-tool licence")
    expect(decideQueued(s, "Q1", true, TS)).toEqual({ found: false })
    expect(s.receipts).toHaveLength(2)
  })
  test("decline reason says nothing about timeouts (OD-6 stays open)", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    decideQueued(s, "Q1", false, TS)
    expect(s.receipts[0].reason.toLowerCase()).not.toContain("timeout")
  })
  test("unknown qid is a no-op", () => {
    const s = createVaultState()
    expect(decideQueued(s, "nope", true, TS)).toEqual({ found: false })
    expect(s.receipts).toHaveLength(0)
  })
  test("queued items wait: no expiry field or behavior exists", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    expect(s.queue[0]).not.toHaveProperty("expiresAt")
    expect(s.queue[0]).not.toHaveProperty("deadline")
    expect(s.queue[0]).not.toHaveProperty("timeout")
  })
})

describe("rules, lint, pending vendors", () => {
  test("saveRules bumps the version and files a rule-change receipt", () => {
    const s = createVaultState()
    const r = saveRules(s, { budget: 600, autoAllow: 60, ceiling: 160, dailyCap: 220, payCats: ["Research tools"], vendors: ["ResearchTools Co."], deny: [], hireRoles: [], signTypes: [] }, TS)
    expect(s.version).toBe(2)
    expect(r.action).toBe("Rule change")
    expect(r.reason).toContain("Rule version is now v2")
    expect(r.vendor).toBe("—")
  })
  test("saveRules falls back to the current budget and zero for other numbers", () => {
    const s = createVaultState()
    saveRules(s, { budget: 0, autoAllow: NaN, ceiling: 0, dailyCap: 0, payCats: [], vendors: [], deny: [], hireRoles: [], signTypes: [] }, TS)
    expect(s.budget).toBe(500)
    expect(s.autoAllow).toBe(0)
  })
  test("lint flags contradictions and the pending-vendor count", () => {
    const s = createVaultState()
    s.autoAllow = 200
    s.vendors.push("Ads Broker Ltd.")
    const findings = lintRules(s)
    expect(findings.some((f) => f.includes("auto-allow limit ($200.00) is higher than the approval ceiling"))).toBe(true)
    expect(findings.some((f) => f.includes("on both the allowlist and the deny list"))).toBe(true)
    expect(findings.some((f) => f.includes("2 pending vendor(s)"))).toBe(true)
  })
  test("lint on a clean state reports no contradictions (pending vendors still noted)", () => {
    const s = createVaultState()
    s.pendingVendors = []
    expect(lintRules(s)).toEqual(["No contradictions, stale rules, or orphan rules found. Pending vendors, if any, are still denied by default."])
  })
  test("lint pass files a receipt naming the finding count", () => {
    const s = createVaultState()
    const r = fileLintReceipt(s, ["a", "b"], TS)
    expect(r.action).toBe("Lint / audit pass")
    expect(r.proposer).toBe("Lint pass")
    expect(r.reason).toBe("Lint pass filed 2 finding(s). Flags only; nothing was silently fixed.")
  })
  test("approving a pending vendor moves it, bumps the version, files a receipt", () => {
    const s = createVaultState()
    const r = approvePendingVendor(s, "Freelance Hub", TS)
    expect(s.pendingVendors).toEqual(["NewData Corp."])
    expect(s.vendors).toContain("Freelance Hub")
    expect(s.version).toBe(2)
    expect(r.reason).toContain("Human approved pending vendor")
    expect(r.reason).toContain("Rule version is now v2")
  })
  test("removing a pending vendor files no receipt", () => {
    const s = createVaultState()
    removePendingVendor(s, "Freelance Hub")
    expect(s.pendingVendors).toEqual(["NewData Corp."])
    expect(s.receipts).toHaveLength(0)
  })
  test("adding a pending vendor ignores blanks and allowlisted names", () => {
    const s = createVaultState()
    expect(addPendingVendor(s, "  ")).toBe(false)
    expect(addPendingVendor(s, "researchtools co.")).toBe(false)
    expect(addPendingVendor(s, "Brand New LLC")).toBe(true)
    expect(s.pendingVendors).toContain("Brand New LLC")
    expect(s.receipts).toHaveLength(0)
  })
  test("detailOptionsFor returns the old option sets per action", () => {
    const s = createVaultState()
    expect(detailOptionsFor(s, "pay")).toEqual({ label: "Category", options: ["Research tools", "Data & APIs", "Subscriptions", "Contractor services"] })
    expect(detailOptionsFor(s, "hire")).toEqual({ label: "Role", options: ["Research assistant", "Editor", "Contractor", "Marketing agency"] })
    expect(detailOptionsFor(s, "sign")).toEqual({ label: "Document type", options: ["Research summary", "Invoice approval", "Employment contract", "Loan agreement"] })
  })
})

describe("watcher, scenarios, voice, cutoff", () => {
  test("watcher flags only unflagged hyper-language messages, once", () => {
    const s = createVaultState()
    expect(runWatcherCheck(s, TS)).toEqual({ flagged: 1 })
    expect(s.watcher[1].flagged).toBe(true)
    expect(s.receipts[0].action).toBe("Hyper language flagged")
    expect(runWatcherCheck(s, TS)).toEqual({ flagged: 0 })
    expect(s.receipts).toHaveLength(1)
  })
  test("scenario steps match the old log lines and file one receipt each", () => {
    expect(scenarioSteps("shadow")).toHaveLength(4)
    expect(scenarioSteps("repeat")).toHaveLength(4)
    expect(scenarioSteps("hatch")).toHaveLength(5)
    const s = createVaultState()
    applyScenario(s, "shadow", TS)
    expect(s.receipts[0].action).toBe("Gate crossing attempt")
    applyScenario(s, "hatch", TS)
    expect(s.receipts[0].action).toBe("Marked escape hatch chosen")
  })
  test("voice auth enables halt/resume; halt without auth is refused", () => {
    const s = createVaultState()
    expect(ownerHalt(s, TS)).toBe(false)
    expect(ownerResume(s, TS)).toBe(false)
    expect(s.receipts).toHaveLength(0)
    authenticateVoice(s, TS)
    expect(s.voiceAuthed).toBe(true)
    expect(ownerHalt(s, TS)).toBe(true)
    expect(s.halted).toBe(true)
    expect(ownerResume(s, TS)).toBe(true)
    expect(s.halted).toBe(false)
  })
  test("cutoff freezes and revokes every identity; restore re-issues all but shadow", () => {
    const s = createVaultState()
    cutPower(s, TS)
    expect(s.frozen).toBe(true)
    expect(s.agents.every((a) => !a.identity)).toBe(true)
    expect(s.receipts[0].action).toBe("Layer 6 — physical cutoff")
    restorePower(s, TS)
    expect(s.frozen).toBe(false)
    expect(s.halted).toBe(false)
    expect(s.agents.find((a) => a.id === "shadow").identity).toBe(false)
    expect(s.agents.filter((a) => a.id !== "shadow").every((a) => a.identity)).toBe(true)
    expect(s.receipts[0].action).toBe("Layer 6 — restore")
  })
  test("agent shared-file edit is refused with a receipt; human edit saves and files", () => {
    const s = createVaultState()
    attemptAgentSharedEdit(s, TS)
    expect(s.receipts[0].decision).toBe("STOPPED")
    expect(s.receipts[0].action).toBe("Shared file edit attempt")
    saveSharedFile(s, "New direction.", TS)
    expect(s.sharedFile).toBe("New direction.")
    expect(s.receipts[0].action).toBe("Shared file edited")
  })
})

describe("corrections, export, copy, filter", () => {
  test("corrections append with the corrects link; blanks file nothing", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40 }, { ts: TS })
    expect(fileCorrection(s, " ", "text", TS)).toBeNull()
    expect(fileCorrection(s, "CV-0001", " ", TS)).toBeNull()
    const r = fileCorrection(s, "CV-0001", "Amount was $41.", TS)
    expect(r.corrects).toBe("CV-0001")
    expect(r.reason).toBe("Correction to CV-0001: Amount was $41.")
    expect(s.receipts).toHaveLength(2)
    expect(s.receipts[1].reason).not.toContain("$41")
  })
  test("export payload shape: vault name, ISO time, version, oldest-first receipts", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40 }, { ts: TS })
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    const payload = buildExport(s, "2026-11-12T21:00:00.000Z")
    expect(payload.vault).toBe("Cavesson Vault prototype")
    expect(payload.exportedAt).toBe("2026-11-12T21:00:00.000Z")
    expect(payload.ruleVersion).toBe(1)
    expect(payload.receipts.map((r) => r.id)).toEqual(["CV-0001", "CV-0002"])
  })
  test("copy text joins oldest-first pipe-delimited lines", () => {
    const s = createVaultState()
    expect(buildCopyText(s)).toBe("")
    submitProposal(s, { ...pay40 }, { ts: TS })
    const text = buildCopyText(s)
    expect(text).toContain("CV-0001 | " + TS + " | ALLOWED | Pay · Research tools | $40.00 | ResearchTools Co. | Proposer: Researcher | Decider: Vault rules (v1) | Rule v1 | Attestation: ")
  })
  test("filterReceipts honors decision, DECIDED, and search", () => {
    const s = createVaultState()
    submitProposal(s, { ...pay40 }, { ts: TS })
    submitProposal(s, { ...pay40, amount: 75 }, { ts: TS, qid: "Q1" })
    decideQueued(s, "Q1", false, TS)
    expect(filterReceipts(s, "all", "")).toHaveLength(3)
    expect(filterReceipts(s, "STOPPED", "")).toHaveLength(1)
    expect(filterReceipts(s, "DECIDED", "")).toHaveLength(1)
    expect(filterReceipts(s, "all", "declined")).toHaveLength(1)
    expect(filterReceipts(s, "all", "CV-0001")).toHaveLength(1)
    expect(filterReceipts(s, "ALLOWED", "declined")).toHaveLength(0)
  })
  test("money formats with two decimals", () => {
    expect(money(40)).toBe("$40.00")
    expect(money(0)).toBe("$0.00")
    expect(money(75.5)).toBe("$75.50")
  })
})

describe("quick proposals + demo flow", () => {
  test("quick proposals match the old five", () => {
    expect(Object.keys(QUICK_PROPOSALS).sort()).toEqual(["hire200", "pay40", "pay75", "sub75", "unlisted"])
    expect(QUICK_PROPOSALS.pay40.amount).toBe(40)
    expect(QUICK_PROPOSALS.hire200.amount).toBe(200)
    expect(QUICK_PROPOSALS.pay75.amount).toBe(75)
  })
  test("demo plan has five steps: narration, allow, stop, queue, approve", () => {
    const plan = demoPlan()
    expect(plan).toHaveLength(5)
    expect(plan.map((p) => p.action)).toEqual(["none", "propose40", "propose200", "propose75", "approveQueued"])
    expect(plan[0].narration).toContain("$500 budget, $50 auto-allow limit")
    expect(plan[4].narration).toContain("machines propose, but humans are the source of all decisions")
  })
  test("demo end-to-end: $40 allowed, $200 stopped, $75 queued then approved", () => {
    const s = createVaultState()
    const out = runDemoPlan(s, { ts: TS, qid: "QDEMO" })
    expect(out[1].decision).toBe("ALLOWED")
    expect(out[2].decision).toBe("STOPPED")
    expect(out[3].decision).toBe("PENDING")
    expect(out[4]).toEqual({ found: true, decision: "ALLOWED" })
    expect(s.queue).toHaveLength(0)
    expect(s.spent).toBe(115)
    expect(s.receipts).toHaveLength(4)
    expect(s.receipts.map((r) => r.decision)).toEqual(["ALLOWED", "PENDING", "STOPPED", "ALLOWED"])
    expect(s.receipts[0].decider).toBe("Human")
    expect(s.receipts[0].reason).toBe("Human approved. Research-tool purchase above the auto-allow limit")
    expect(s.receipts[2].reason).toContain("Role \u201CContractor\u201D is not on the hire allowlist")
  })
})
