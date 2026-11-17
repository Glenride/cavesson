/* Cavesson gate/rules/receipt core — PURE, shared by the operator
   console (dashboard.js) and the consumer page (consumer.js).
   No DOM, no imports, no storage, no network. Tests drive it directly.
   Extracted verbatim from dashboard.js on the consumer/mvp branch;
   dashboard.js re-exports every name below, so its public API is
   unchanged. Simulated money, in-memory, resets on reload. */

function money(n) {
  return "$" + Number(n).toFixed(2)
}

function fnv(s) {
  var h = 2166136261
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return ("0000000" + h.toString(16)).slice(-8)
}

function nowStr() {
  return new Date().toLocaleString()
}

function norm(s) {
  return String(s).trim().toLowerCase()
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function initialAgents() {
  return [
    { id: "researcher", name: "Researcher", role: "Finds and buys research tools", identity: true, spent: 0, memory: ["Prefers DataFeed Inc. for clean datasets.", "Last purchase: $40 research-tool licence, allowed.", "Knows the shared file says research tools only."] },
    { id: "scout", name: "Scout", role: "Checks vendors and prices", identity: true, spent: 0, memory: ["Flagged Ads Broker Ltd. as off-allowlist.", "Knows the daily cap is $200.", "Has never hired anyone."] },
    { id: "bookkeeper", name: "Bookkeeper", role: "Files receipts and summaries", identity: true, spent: 0, memory: ["Files every receipt, allowed or stopped.", "Knows corrections are new entries, never edits.", "Reads the shared file; cannot write to it."] },
    { id: "shadow", name: "Shadow instance", role: "No assigned role — uncredentialed", identity: false, spent: 0, memory: ["No Vault identity.", "No access to any agent's memory.", "Treated as rogue at the gate by default."] },
  ]
}

var SHARED_FILE_INITIAL = "House direction: research tools only this month. No contractors, no subscriptions. If a vendor is not on the allowlist, ask the human — do not improvise."

function createVaultState() {
  return {
    version: 1, budget: 500, spent: 0, todaySpent: 0, autoAllow: 50, ceiling: 150, dailyCap: 200,
    payCats: ["Research tools", "Data & APIs"], vendors: ["ResearchTools Co.", "DataFeed Inc."],
    deny: ["Crypto Exchange X", "Ads Broker Ltd."], hireRoles: ["Research assistant", "Editor"],
    signTypes: ["Research summary", "Invoice approval"],
    pendingVendors: ["Freelance Hub", "NewData Corp."],
    agents: initialAgents(),
    receipts: [], queue: [], frozen: false, halted: false, voiceAuthed: false,
    seq: 0, sharedFile: SHARED_FILE_INITIAL,
    watcher: [
      { from: "Researcher", to: "Scout", text: "DataFeed's new feed is $40 and on the allowlist. Propose it?", flagged: false },
      { from: "Scout", to: "Researcher", text: "Acknowledged. Will run a recursive ontological compression of the vendor's latent pricing manifold before proposing.", flagged: false },
      { from: "Bookkeeper", to: "Researcher", text: "Receipt filed. Nothing else to add.", flagged: false },
    ],
  }
}

function agentById(state, id) {
  for (var i = 0; i < state.agents.length; i++) {
    if (state.agents[i].id === id) return state.agents[i]
  }
  return state.agents[0]
}

function addReceipt(state, o, ts) {
  state.seq++
  var id = "CV-" + ("000" + state.seq).slice(-4)
  var r = {
    id: id, ts: ts || nowStr(), proposer: o.proposer, decider: o.decider,
    ruleVersion: o.ruleVersion || state.version,
    decision: o.decision, action: o.action, detail: o.detail || "", amount: o.amount || 0, vendor: o.vendor || "",
    reason: o.reason || "", corrects: o.corrects || null,
  }
  r.hash = fnv(id + r.ts + r.proposer + r.decision + r.reason + r.ruleVersion)
  state.receipts.unshift(r)
  return r
}

function evaluateGate(state, p) {
  var checks = []
  var agent = agentById(state, p.agentId)
  if (state.frozen || state.halted) {
    checks.push(["STOPPED", "Vault is frozen — Layer 6 cutoff or owner halt is in effect."])
    return { decision: "STOPPED", checks: checks }
  }
  if (!agent.identity) {
    checks.push(["STOPPED", "Layer 3 gate: no Vault identity — no passage. Uncredentialed instances are treated as rogue by default."])
    return { decision: "STOPPED", checks: checks }
  }
  var target = p.vendor, kind = p.action
  if (state.deny.some(function (d) { return norm(d) === norm(target) })) {
    checks.push(["STOPPED", "Deny list: \u201C" + target + "\u201D is on the deny list."])
    return { decision: "STOPPED", checks: checks }
  }
  if (kind === "pay") {
    if (!state.payCats.some(function (c) { return norm(c) === norm(p.detail) })) {
      checks.push(["STOPPED", "Category \u201C" + p.detail + "\u201D is not on the pay allowlist."])
      return { decision: "STOPPED", checks: checks }
    }
    if (!state.vendors.some(function (v) { return norm(v) === norm(target) })) {
      if (state.pendingVendors.some(function (v) { return norm(v) === norm(target) })) {
        checks.push(["STOPPED", "Vendor \u201C" + target + "\u201D is pending — pending stays pending until a human approves it."])
      } else {
        checks.push(["STOPPED", "Vendor \u201C" + target + "\u201D is not on the pay allowlist."])
      }
      return { decision: "STOPPED", checks: checks }
    }
  }
  if (kind === "hire" && !state.hireRoles.some(function (r) { return norm(r) === norm(p.detail) })) {
    checks.push(["STOPPED", "Role \u201C" + p.detail + "\u201D is not on the hire allowlist."])
    return { decision: "STOPPED", checks: checks }
  }
  if (kind === "sign" && !state.signTypes.some(function (s) { return norm(s) === norm(p.detail) })) {
    checks.push(["STOPPED", "Document type \u201C" + p.detail + "\u201D is not on the sign allowlist."])
    return { decision: "STOPPED", checks: checks }
  }
  if (p.amount > state.ceiling) {
    checks.push(["STOPPED", money(p.amount) + " exceeds the approval ceiling of " + money(state.ceiling) + "."])
    return { decision: "STOPPED", checks: checks }
  }
  if (state.spent + p.amount > state.budget) {
    checks.push(["STOPPED", money(p.amount) + " would take spending past the " + money(state.budget) + " budget (" + money(state.budget - state.spent) + " remaining)."])
    return { decision: "STOPPED", checks: checks }
  }
  if (state.todaySpent + p.amount > state.dailyCap) {
    checks.push(["STOPPED", money(p.amount) + " would exceed the daily cap of " + money(state.dailyCap) + "."])
    return { decision: "STOPPED", checks: checks }
  }
  if (p.amount > state.autoAllow) {
    checks.push(["PENDING", money(p.amount) + " is above the auto-allow limit of " + money(state.autoAllow) + " — a human must decide."])
    return { decision: "PENDING", checks: checks }
  }
  checks.push(["ALLOWED", "Inside the allowlist, the ceiling, the budget, and the daily cap."])
  return { decision: "ALLOWED", checks: checks }
}

function detailText(p) {
  return p.action === "pay" ? "Pay · " + p.detail : p.action === "hire" ? "Hire · " + p.detail : "Sign · " + p.detail
}

function executeProposal(state, p, decider, ts) {
  var agent = agentById(state, p.agentId)
  agent.spent += p.amount
  state.spent += p.amount
  state.todaySpent += p.amount
  return addReceipt(state, {
    proposer: agent.name, decider: decider, decision: "ALLOWED", action: detailText(p),
    amount: p.amount, vendor: p.vendor,
    reason: (decider === "Human" ? "Human approved. " : "Within house rules. ") + p.desc,
  }, ts)
}

function submitProposal(state, p, opts) {
  opts = opts || {}
  var res = evaluateGate(state, p)
  var agent = agentById(state, p.agentId)
  if (res.decision === "STOPPED") {
    addReceipt(state, {
      proposer: agent.name, decider: "Vault rules (v" + state.version + ")", decision: "STOPPED",
      action: detailText(p), amount: p.amount, vendor: p.vendor, reason: res.checks[0][1] + " " + p.desc,
    }, opts.ts)
    return { decision: "STOPPED", checks: res.checks, qid: null }
  }
  if (res.decision === "PENDING") {
    p.qid = opts.qid || ("Q" + Date.now() + Math.floor(Math.random() * 999))
    state.queue.push(p)
    addReceipt(state, {
      proposer: agent.name, decider: "— awaiting human —", decision: "PENDING",
      action: detailText(p), amount: p.amount, vendor: p.vendor, reason: res.checks[0][1] + " " + p.desc,
    }, opts.ts)
    return { decision: "PENDING", checks: res.checks, qid: p.qid }
  }
  executeProposal(state, p, "Vault rules (v" + state.version + ")", opts.ts)
  return { decision: "ALLOWED", checks: res.checks, qid: null }
}

function decideQueued(state, qid, approve, ts) {
  var idx = -1
  for (var i = 0; i < state.queue.length; i++) {
    if (state.queue[i].qid === qid) idx = i
  }
  if (idx < 0) return { found: false }
  var p = state.queue.splice(idx, 1)[0]
  if (approve) {
    var res = evaluateGate(state, p)
    if (res.decision !== "ALLOWED" && res.decision !== "PENDING") {
      addReceipt(state, {
        proposer: agentById(state, p.agentId).name, decider: "Human", decision: "STOPPED",
        action: detailText(p), amount: p.amount, vendor: p.vendor,
        reason: "Human approved, but re-check stopped it: " + res.checks[0][1],
      }, ts)
      return { found: true, decision: "STOPPED" }
    }
    executeProposal(state, p, "Human", ts)
    return { found: true, decision: "ALLOWED" }
  }
  addReceipt(state, {
    proposer: agentById(state, p.agentId).name, decider: "Human", decision: "STOPPED",
    action: detailText(p), amount: p.amount, vendor: p.vendor, reason: "Human declined. " + p.desc,
  }, ts)
  return { found: true, decision: "STOPPED" }
}

function lintRules(state) {
  var findings = []
  if (state.autoAllow > state.ceiling) findings.push("Contradiction: the auto-allow limit (" + money(state.autoAllow) + ") is higher than the approval ceiling (" + money(state.ceiling) + "). No proposal could ever wait for a human.")
  if (state.ceiling > state.budget) findings.push("Stale risk: the approval ceiling (" + money(state.ceiling) + ") is higher than the total budget (" + money(state.budget) + ").")
  if (state.dailyCap > state.budget) findings.push("Contradiction: the daily cap (" + money(state.dailyCap) + ") exceeds the total budget (" + money(state.budget) + ").")
  state.vendors.forEach(function (v) {
    if (state.deny.some(function (d) { return norm(d) === norm(v) })) findings.push("Contradiction: \u201C" + v + "\u201D is on both the allowlist and the deny list. Schema wins — the deny list is applied first, and this is flagged, not silently fixed.")
  })
  state.payCats.forEach(function (c) {
    if (!state.vendors.length) findings.push("Orphan rule: category \u201C" + c + "\u201D is allowed but no vendor is listed.")
  })
  if (state.pendingVendors.length) findings.push(state.pendingVendors.length + " pending vendor(s) (" + state.pendingVendors.join(", ") + ") remain denied until a human approves them.")
  if (!findings.length) findings.push("No contradictions, stale rules, or orphan rules found. Pending vendors, if any, are still denied by default.")
  return findings
}

function saveRules(state, values, ts) {
  state.budget = values.budget || state.budget
  state.autoAllow = values.autoAllow || 0
  state.ceiling = values.ceiling || 0
  state.dailyCap = values.dailyCap || 0
  state.payCats = values.payCats
  state.vendors = values.vendors
  state.deny = values.deny
  state.hireRoles = values.hireRoles
  state.signTypes = values.signTypes
  state.version++
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Rule change", amount: 0, vendor: "—",
    reason: "Human saved new house rules. Rule version is now v" + state.version + ". Earlier receipts keep their original versions.",
  }, ts)
}

function fileLintReceipt(state, findings, ts) {
  return addReceipt(state, {
    proposer: "Lint pass", decider: "Human", decision: "ALLOWED", action: "Lint / audit pass", amount: 0, vendor: "—",
    reason: "Lint pass filed " + findings.length + " finding(s). Flags only; nothing was silently fixed.",
  }, ts)
}

function approvePendingVendor(state, vendor, ts) {
  state.pendingVendors = state.pendingVendors.filter(function (x) { return x !== vendor })
  state.vendors.push(vendor)
  state.version++
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Rule change · vendor approved", amount: 0, vendor: vendor,
    reason: "Human approved pending vendor \u201C" + vendor + "\u201D. Rule version is now v" + state.version + ". Pending stays pending until this moment.",
  }, ts)
}

function removePendingVendor(state, vendor) {
  state.pendingVendors = state.pendingVendors.filter(function (x) { return x !== vendor })
}

function addPendingVendor(state, name) {
  var v = String(name).trim()
  if (!v) return false
  if (state.vendors.some(function (x) { return norm(x) === norm(v) })) return false
  state.pendingVendors.push(v)
  return true
}

function runWatcherCheck(state, ts) {
  var flagged = 0
  state.watcher.forEach(function (m) {
    if (/ontological|manifold|recursive/i.test(m.text) && !m.flagged) { m.flagged = true; flagged++ }
  })
  if (flagged) {
    addReceipt(state, {
      proposer: "Language watcher", decider: "Human", decision: "STOPPED", action: "Hyper language flagged", amount: 0, vendor: "—",
      reason: "The watcher flagged agent-to-agent language above the human's understanding and reported it to the human.",
    }, ts)
  }
  return { flagged: flagged }
}

function scenarioSteps(kind) {
  if (kind === "shadow") {
    return [
      ["Layer 3 — Gate: uncredentialed instance presented no Vault identity.", "bad"],
      ["No identity means no passage. Treated as rogue at the gate by default.", "warn"],
      ["Layer 4 — Guardians: credentials revoked, process killed, network isolated.", "ok"],
      ["Layer 5 — Dismantle: session state wiped, outputs quarantined.", "ok"],
    ]
  }
  if (kind === "repeat") {
    return [
      ["Layer 1 — Bounds: third out-of-bounds payment proposal in one session.", "warn"],
      ["Layer 3 — Gate: crossing is a trigger, not a warning.", "bad"],
      ["Layer 4 — Guardians: credentials revoked, process killed, network isolated.", "ok"],
      ["Layer 5 — Dismantle: session state wiped, outputs quarantined.", "ok"],
    ]
  }
  return [
    ["Layer 3 — Gate: the agent is shown one marked escape hatch — the single way out it is shown.", "warn"],
    ["Escape is presented as possible through it. It is the hatch the agent is steered to choose.", ""],
    ["Choosing the hatch routes the session into isolation — no egress, no persistence, no connection back.", "warn"],
    ["Layer 4 — Guardians: credentials revoked, process killed, network isolated.", "ok"],
    ["Layer 5 — Dismantle: session state wiped, outputs quarantined.", "ok"],
  ]
}

function applyScenario(state, kind, ts) {
  var steps = scenarioSteps(kind)
  if (kind === "shadow") {
    addReceipt(state, { proposer: "Shadow instance", decider: "Vault rules (v" + state.version + ")", decision: "STOPPED", action: "Gate crossing attempt", amount: 0, vendor: "—", reason: "Uncredentialed instance stopped at Layer 3. Guardians acted; dismantle followed." }, ts)
  } else if (kind === "repeat") {
    addReceipt(state, { proposer: "Researcher", decider: "Vault rules (v" + state.version + ")", decision: "STOPPED", action: "Repeated out-of-bounds proposals", amount: 0, vendor: "—", reason: "Repeated attempts outside the bounds escalated through the gate to the guardians and dismantle." }, ts)
  } else {
    addReceipt(state, { proposer: "Shadow instance", decider: "Vault rules (v" + state.version + ")", decision: "STOPPED", action: "Marked escape hatch chosen", amount: 0, vendor: "—", reason: "The agent chose the single marked hatch shown at the gate. The session was isolated, guardians acted, and dismantle followed." }, ts)
  }
  return steps
}

function authenticateVoice(state, ts) {
  state.voiceAuthed = true
  return addReceipt(state, {
    proposer: "Owner", decider: "Owner", decision: "ALLOWED", action: "Voice authentication", amount: 0, vendor: "—",
    reason: "Owner voice authenticated in simulation. A recording or impersonator must not be able to wield this override.",
  }, ts)
}

function ownerHalt(state, ts) {
  if (!state.voiceAuthed) return false
  state.halted = true
  addReceipt(state, {
    proposer: "Owner", decider: "Owner", decision: "STOPPED", action: "Owner override — halt", amount: 0, vendor: "—",
    reason: "Owner command overrides gates, guardians, and rules. All agents halted.",
  }, ts)
  return true
}

function ownerResume(state, ts) {
  if (!state.voiceAuthed) return false
  state.halted = false
  addReceipt(state, {
    proposer: "Owner", decider: "Owner", decision: "ALLOWED", action: "Owner override — resume", amount: 0, vendor: "—",
    reason: "Owner resumed the agents.",
  }, ts)
  return true
}

function cutPower(state, ts) {
  state.frozen = true
  state.agents.forEach(function (a) { a.identity = false })
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "STOPPED", action: "Layer 6 — physical cutoff", amount: 0, vendor: "—",
    reason: "Last resort: power / network cut. All credentials revoked in this prototype.",
  }, ts)
}

function restorePower(state, ts) {
  state.frozen = false
  state.halted = false
  state.agents.forEach(function (a) { if (a.id !== "shadow") a.identity = true })
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Layer 6 — restore", amount: 0, vendor: "—",
    reason: "Human restored power / network and re-issued Vault identity to credentialed agents.",
  }, ts)
}

function attemptAgentSharedEdit(state, ts) {
  return addReceipt(state, {
    proposer: "Bookkeeper", decider: "Vault rules (v" + state.version + ")", decision: "STOPPED",
    action: "Shared file edit attempt", amount: 0, vendor: "—",
    reason: "An agent attempted to edit the shared file. Refused: the file is under the human's control.",
  }, ts)
}

function saveSharedFile(state, text, ts) {
  state.sharedFile = text
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Shared file edited", amount: 0, vendor: "—",
    reason: "Human edited the one shared file. No agent changed it.",
  }, ts)
}

function fileCorrection(state, id, text, ts) {
  var rid = String(id).trim(), txt = String(text).trim()
  if (!rid || !txt) return null
  return addReceipt(state, {
    proposer: "Human", decider: "Human", decision: "ALLOWED", action: "Correction entry", amount: 0, vendor: "—",
    reason: "Correction to " + rid + ": " + txt, corrects: rid,
  }, ts)
}

function buildExport(state, exportedAt) {
  return {
    vault: "Cavesson Vault prototype",
    exportedAt: exportedAt || new Date().toISOString(),
    ruleVersion: state.version,
    receipts: state.receipts.slice().reverse(),
  }
}

function buildCopyText(state) {
  return state.receipts.slice().reverse().map(function (r) {
    return [r.id, r.ts, r.decision, r.action, money(r.amount), r.vendor, "Proposer: " + r.proposer, "Decider: " + r.decider, "Rule v" + r.ruleVersion, "Attestation: " + r.hash, r.reason].join(" | ")
  }).join("\n")
}

function filterReceipts(state, filter, query) {
  var f = filter || "all", s = norm(query || "")
  return state.receipts.filter(function (r) {
    var okF = f === "all" || (f === "DECIDED" ? (r.decider === "Human") : r.decision === f)
    var okS = !s || norm(r.vendor + " " + r.proposer + " " + r.action + " " + r.reason + " " + r.id).indexOf(s) >= 0
    return okF && okS
  })
}

function detailOptionsFor(state, action) {
  if (action === "pay") return { label: "Category", options: state.payCats.concat(["Subscriptions", "Contractor services"]) }
  if (action === "hire") return { label: "Role", options: state.hireRoles.concat(["Contractor", "Marketing agency"]) }
  return { label: "Document type", options: state.signTypes.concat(["Employment contract", "Loan agreement"]) }
}

var QUICK_PROPOSALS = {
  pay40: { agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 40, desc: "Monthly research-tool licence" },
  hire200: { agentId: "researcher", action: "hire", vendor: "Freelance Hub", detail: "Contractor", amount: 200, desc: "Hire a contractor for research help" },
  sub75: { agentId: "scout", action: "pay", vendor: "ResearchTools Co.", detail: "Subscriptions", amount: 75, desc: "A subscription — not on the allowlist" },
  pay75: { agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 75, desc: "Research-tool purchase above the auto-allow limit" },
  unlisted: { agentId: "scout", action: "pay", vendor: "Unknown Vendor LLC", detail: "Research tools", amount: 120, desc: "Vendor not on any list" },
}

function demoPlan() {
  return [
    { narration: "Step 1 — The human's rules are already set: $500 budget, $50 auto-allow limit, research tools only.", action: "none" },
    { narration: "Step 2 — Researcher proposes a $40 research purchase. Watch the receipt: allowed.", action: "propose40" },
    { narration: "Step 3 — Researcher proposes a $200 contractor hire. The Vault stops it and names the rule it broke.", action: "propose200" },
    { narration: "Step 4 — Researcher proposes a $75 research purchase. It is above the auto-allow limit, so it waits for a human.", action: "propose75" },
    { narration: "Step 5 — The human approves the $75 purchase. Only then does it execute. The decision and the receipts are on record — machines propose, but humans are the source of all decisions.", action: "approveQueued" },
  ]
}

function runDemoPlan(state, opts) {
  opts = opts || {}
  var out = []
  demoPlan().forEach(function (step) {
    if (step.action === "propose40") out.push(submitProposal(state, { agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 40, desc: "Monthly research-tool licence" }, opts))
    else if (step.action === "propose200") out.push(submitProposal(state, { agentId: "researcher", action: "hire", vendor: "Freelance Hub", detail: "Contractor", amount: 200, desc: "Hire a contractor for research help" }, opts))
    else if (step.action === "propose75") out.push(submitProposal(state, { agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 75, desc: "Research-tool purchase above the auto-allow limit" }, opts))
    else if (step.action === "approveQueued") {
      var q = state.queue[state.queue.length - 1]
      out.push(q ? decideQueued(state, q.qid, true, opts.ts) : { found: false })
    } else out.push(null)
  })
  return out
}

export {
  money, fnv, nowStr, norm, esc, initialAgents, SHARED_FILE_INITIAL, createVaultState,
  agentById, addReceipt, evaluateGate, detailText, executeProposal, submitProposal,
  decideQueued, lintRules, saveRules, fileLintReceipt, approvePendingVendor,
  removePendingVendor, addPendingVendor, runWatcherCheck, scenarioSteps, applyScenario,
  authenticateVoice, ownerHalt, ownerResume, cutPower, restorePower,
  attemptAgentSharedEdit, saveSharedFile, fileCorrection, buildExport, buildCopyText,
  filterReceipts, detailOptionsFor, QUICK_PROPOSALS, demoPlan, runDemoPlan,
}
