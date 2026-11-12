/* Cavesson Vault prototype dashboard.
   Simulated money, in-memory, resets on reload. Nothing persists and
   nothing here spends, hires, or signs anything real. The gate and rules
   core below is pure (no DOM) so tests can drive it directly; the DOM
   wiring lives in initDashboard at the bottom of this file. */

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

/* ------------------------------------------------------------------ */
/* DOM wiring                                                          */
/* ------------------------------------------------------------------ */

var UPGRADE_TAGS = [
  "ui-button", "ui-field", "ui-select", "ui-number-input", "ui-input",
  "ui-textarea", "ui-meter", "ui-timeline", "ui-accordion", "ui-collapsible",
  "ui-alert-dialog", "ui-toast-region",
]

function whenReady(doc, timeoutMs) {
  var t = timeoutMs == null ? 3000 : timeoutMs
  var ce = doc.defaultView && doc.defaultView.customElements
  if (!ce || !ce.whenDefined) return Promise.resolve()
  return Promise.all(UPGRADE_TAGS.map(function (tag) {
    return Promise.race([
      ce.whenDefined(tag).catch(function () {}),
      new Promise(function (r) { setTimeout(r, t) }),
    ])
  }))
}

function initDashboard(doc, opts) {
  doc = doc || document
  opts = opts || {}
  var $ = function (id) { return doc.getElementById(id) }
  var state = createVaultState()
  var demoTimers = []
  var receiptFilter = "all"
  var receiptQuery = ""
  var lastAgentItemsSignature = ""
  var editingShared = false
  var lastCheck = $("lastCheck")

  function notify(type, title, description) {
    var region = $("notifications")
    if (region && typeof region.toaster === "function") {
      var t = region.toaster
      if (type === "error" && typeof t.error === "function") t.error(title, { description: description })
      else if (type === "success" && typeof t.success === "function") t.success(title, { description: description })
      else t(title, { description: description })
    }
  }

  function onValue(el, fn) {
    if (!el) return
    var last
    var emit = function (v) {
      if (v !== last) { last = v; fn(v) }
    }
    el.addEventListener("valuechange", function (e) { emit(e.detail.value) })
    var native = el.querySelector("input, textarea")
    if (native) native.addEventListener("input", function () { emit(el.value) })
  }

  function setNumberValue(el, v) {
    if (!el) return
    if (el.api && typeof el.api.setValue === "function") el.api.setValue(v)
    else el.value = v
  }

  function setTextValue(el, v) {
    if (!el) return
    if (el.api && typeof el.api.setValue === "function") el.api.setValue(v)
    else el.value = v
  }

  function onAction(el, fn) {
    if (!el) return
    el.addEventListener("action", fn)
  }

  function renderStats() {
    var remaining = state.budget - state.spent
    var sr = $("statRemaining"), ss = $("statSpent")
    if (sr) sr.textContent = money(remaining)
    if (ss) ss.textContent = "Spent " + money(state.spent) + " of " + money(state.budget) + " · Rule v" + state.version
    var meter = $("budgetMeter")
    if (meter) { meter.max = state.budget; meter.value = state.spent }
    var sp = $("statPending"), ss2 = $("statStopped"), sr2 = $("statReceipts")
    if (sp) sp.textContent = String(state.queue.length)
    if (ss2) ss2.textContent = String(state.receipts.filter(function (r) { return r.decision === "STOPPED" }).length)
    if (sr2) sr2.textContent = String(state.receipts.length)
    var pp = $("pendingPill"), rp = $("ruleVersionPill")
    if (pp) pp.textContent = state.queue.length + " pending"
    if (rp) rp.textContent = "Rule v" + state.version
    var vs = $("vaultState")
    if (vs) {
      var txt = state.frozen ? "Vault frozen — power / network cut" : state.halted ? "Agents halted by owner override" : "Vault armed"
      vs.innerHTML = '<span class="dot"></span>' + esc(txt)
      vs.classList.toggle("frozen", state.frozen || state.halted)
    }
  }

  function renderAgents() {
    var agentSel = $("agentSel")
    if (agentSel) {
      var sig = JSON.stringify(state.agents.map(function (a) { return [a.id, a.identity] }))
      if (sig !== lastAgentItemsSignature) {
        lastAgentItemsSignature = sig
        agentSel.items = state.agents.map(function (a) {
          return { value: a.id, label: a.name + (a.identity ? "" : " — no Vault identity") }
        })
      }
    }
    var list = $("agentCards")
    if (list) {
      list.innerHTML = state.agents.map(function (a) {
        return '<div class="agent-card"><h3>' + esc(a.name) + " " + (a.identity ? '<span class="pill allowed">Vault identity</span>' : '<span class="pill frozen">No identity</span>') + '</h3><p class="hint" style="margin:.2rem 0">' + esc(a.role) + " · Simulated spend " + money(a.spent) + '</p><p style="font-size:.9rem;margin:.3rem 0"><strong>Segmented memory — visible only to this agent:</strong></p><ul>' + a.memory.map(function (m) { return "<li>" + esc(m) + "</li>" }).join("") + '</ul><p class="hint" style="font-size:.86rem">Cannot see the other agents\u2019 memories. Working in the same workspace does not mean sharing memory.</p></div>'
      }).join("")
    }
    var dl = $("vendorList")
    if (dl) {
      dl.innerHTML = state.vendors.concat(state.pendingVendors, state.deny).map(function (v) { return "<option value=\"" + esc(v) + "\">" }).join("")
    }
  }

  function renderWatcher() {
    var w = $("watcherMessages")
    if (!w) return
    w.innerHTML = state.watcher.map(function (m) {
      return '<div class="queue-item' + (m.flagged ? " flagged" : "") + '"><strong>' + esc(m.from) + " → " + esc(m.to) + ":</strong> " + esc(m.text) + (m.flagged ? '<br><span class="pill pending">Flagged to the human</span> <span class="hint">Above the human\u2019s understanding. Plain version: \u201CScout will check the vendor\u2019s price before proposing.\u201D</span>' : "") + "</div>"
    }).join("")
  }

  function renderQueue() {
    var q = $("queue")
    if (!q) return
    if (!state.queue.length) {
      q.innerHTML = '<div class="empty">Nothing waiting. Proposals above the auto-allow limit appear here for a human decision.</div>'
      return
    }
    q.innerHTML = state.queue.map(function (p) {
      return '<div class="queue-item"><strong>' + esc(detailText(p)) + "</strong> — " + money(p.amount) + " · " + esc(p.vendor) + '<br><span class="hint">Proposed by ' + esc(agentById(state, p.agentId).name) + " · " + esc(p.desc) + '</span><div class="row" style="margin-top:.5rem"><ui-button><button type="button" class="btn small" data-approve="' + esc(p.qid) + '">Approve — human decides</button></ui-button><ui-button><button type="button" class="btn small secondary" data-deny="' + esc(p.qid) + '">Decline</button></ui-button></div></div>'
    }).join("")
    q.querySelectorAll("button[data-approve]").forEach(function (b) {
      var host = b.closest("ui-button") || b
      host.addEventListener("action", function () { decideQueue(b.getAttribute("data-approve"), true) })
    })
    q.querySelectorAll("button[data-deny]").forEach(function (b) {
      var host = b.closest("ui-button") || b
      host.addEventListener("action", function () { decideQueue(b.getAttribute("data-deny"), false) })
    })
  }

  function renderReceipts() {
    var timeline = $("receiptTimeline")
    var empty = $("receiptEmpty")
    var rows = filterReceipts(state, receiptFilter, receiptQuery)
    if (!rows.length) {
      if (timeline) timeline.innerHTML = ""
      if (empty) empty.hidden = false
      return
    }
    if (empty) empty.hidden = true
    if (!timeline) return
    timeline.innerHTML = rows.map(function (r) {
      var pill = r.decision === "ALLOWED" ? "ok" : r.decision === "PENDING" ? "warn" : "bad"
      var meta = "Proposer: " + esc(r.proposer) + " · Decider: " + esc(r.decider) + " · Rule v" + r.ruleVersion + " · Attestation <code>" + esc(r.hash) + "</code>" + (r.corrects ? " · Corrects " + esc(r.corrects) : "")
      return '<ui-timeline-item value="' + esc(r.id) + '" data-decision="' + r.decision + '"><ui-timeline-marker></ui-timeline-marker><ui-timeline-connector></ui-timeline-connector><ui-timeline-title><span class="pill ' + pill + '">' + r.decision + "</span> " + esc(r.id) + " — " + esc(r.action) + " — " + money(r.amount) + " · " + esc(r.vendor) + "</ui-timeline-title><ui-timeline-time><time>" + esc(r.ts) + "</time></ui-timeline-time><ui-timeline-description>" + esc(r.reason) + '<span class="receipt-meta">' + meta + "</span></ui-timeline-description></ui-timeline-item>"
    }).join("")
  }

  function renderPendingVendors() {
    var el = $("pendingVendors")
    if (!el) return
    if (!state.pendingVendors.length) {
      el.innerHTML = '<div class="empty">No pending vendors.</div>'
      return
    }
    el.innerHTML = state.pendingVendors.map(function (v) {
      return '<div class="queue-item"><strong>' + esc(v) + '</strong> <span class="pill pending">Pending</span><div class="row" style="margin-top:.4rem"><ui-button><button type="button" class="btn small" data-approve-vendor="' + esc(v) + '">Approve vendor</button></ui-button><ui-button><button type="button" class="btn small secondary" data-remove-vendor="' + esc(v) + '">Remove</button></ui-button></div></div>'
    }).join("")
    el.querySelectorAll("button[data-approve-vendor]").forEach(function (b) {
      var host = b.closest("ui-button") || b
      host.addEventListener("action", function () {
        approvePendingVendor(state, b.getAttribute("data-approve-vendor"))
        syncRulesForm()
        renderAll()
      })
    })
    el.querySelectorAll("button[data-remove-vendor]").forEach(function (b) {
      var host = b.closest("ui-button") || b
      host.addEventListener("action", function () {
        removePendingVendor(state, b.getAttribute("data-remove-vendor"))
        renderAll()
      })
    })
  }

  function renderAll() {
    renderStats()
    renderAgents()
    renderQueue()
    renderReceipts()
    renderPendingVendors()
    renderWatcher()
  }

  function setLastCheck(checks) {
    if (!lastCheck) return
    lastCheck.innerHTML = checks.map(function (c) {
      return '<li><span class="pill ' + (c[0] === "ALLOWED" ? "ok" : c[0] === "PENDING" ? "warn" : "bad") + '">' + c[0] + "</span> " + esc(c[1]) + "</li>"
    }).join("")
  }

  function submitProposalFromForm(p, source) {
    var res = submitProposal(state, p)
    setLastCheck(res.checks)
    if (res.decision === "ALLOWED") notify("success", "Allowed", res.checks[0][1])
    else if (res.decision === "PENDING") notify("info", "Waiting for a human", res.checks[0][1])
    else notify("error", "Stopped", res.checks[0][1])
    renderAll()
    return res
  }

  function decideQueue(qid, approve) {
    var res = decideQueued(state, qid, approve)
    if (!res.found) return
    notify(approve && res.decision === "ALLOWED" ? "success" : "info", approve && res.decision === "ALLOWED" ? "Approved" : approve ? "Stopped on re-check" : "Declined", approve && res.decision === "ALLOWED" ? "The proposal executed and a receipt was filed." : approve ? "The human approved, but the re-check stopped it." : "The proposal was declined and removed from the queue.")
    renderAll()
  }

  /* The action comes from the valuechange detail: during the event the
     select's .value property still holds the previous value. Callers
     without an event in flight (init, reset, rules save) pass nothing
     and the settled property is read instead. */
  function refreshDetailOptions(action) {
    var detailSel = $("detailInput")
    var label = $("detailLabel")
    var actionSel = $("actionSel")
    if (!detailSel) return
    if (action == null) action = actionSel ? actionSel.value : "pay"
    var info = detailOptionsFor(state, action)
    if (label) label.textContent = info.label
    detailSel.items = info.options.map(function (o) { return { value: o, label: o } })
    if (detailSel.api && typeof detailSel.api.setValue === "function") detailSel.api.setValue(info.options[0])
    else detailSel.value = info.options[0]
  }

  function syncRulesForm() {
    setNumberValue($("budgetInput"), state.budget)
    setNumberValue($("autoInput"), state.autoAllow)
    setNumberValue($("ceilingInput"), state.ceiling)
    setNumberValue($("dailyInput"), state.dailyCap)
    setTextValue($("payCats"), state.payCats.join("\n"))
    setTextValue($("vendors"), state.vendors.join("\n"))
    setTextValue($("denyInput"), state.deny.join("\n"))
    setTextValue($("hireRoles"), state.hireRoles.join("\n"))
    setTextValue($("signTypes"), state.signTypes.join("\n"))
  }

  function linesOf(el) {
    var v = el ? el.value : ""
    return String(v || "").split("\n").map(function (s) { return s.trim() }).filter(Boolean)
  }

  function numOf(el) {
    var v = el ? el.value : null
    return v == null ? NaN : Number(v)
  }

  function logLine(text, cls) {
    var log = $("defenseLog")
    if (!log) return
    if (log.dataset.empty) { log.textContent = ""; delete log.dataset.empty }
    var d = doc.createElement("div")
    if (cls) d.className = cls
    d.textContent = text
    log.appendChild(d)
  }

  function runScenario(kind) {
    var log = $("defenseLog")
    if (log) { log.textContent = ""; delete log.dataset.empty }
    var steps = applyScenario(state, kind)
    steps.forEach(function (s, i) {
      setTimeout(function () { logLine(s[0], s[1]) }, i * 650)
    })
    renderAll()
  }

  function endSharedEdit() {
    if (!editingShared) return
    var host = $("sharedFileHost")
    if (!host) return
    host.innerHTML = '<p id="sharedFileText">' + esc(state.sharedFile) + "</p>"
    var saveBtn = $("sharedSaveBtn")
    if (saveBtn) saveBtn.remove()
    editingShared = false
  }

  function resetAll() {
    demoTimers.forEach(clearTimeout)
    demoTimers = []
    state = createVaultState()
    lastAgentItemsSignature = ""
    if (lastCheck) lastCheck.innerHTML = ""
    var narration = $("demoNarration")
    if (narration) { narration.textContent = ""; narration.hidden = true }
    endSharedEdit()
    var sft = $("sharedFileText")
    if (sft) sft.textContent = state.sharedFile
    var meta = $("sharedFileMeta")
    if (meta) meta.textContent = "Last changed by the human · agents read only"
    syncRulesForm()
    var lintOut = $("lintOut")
    if (lintOut) lintOut.innerHTML = ""
    var log = $("defenseLog")
    if (log) { log.textContent = "Defense log is empty. Run a scenario to see Layers 3–5 act, in order."; log.dataset.empty = "1" }
    var vs = $("voiceStatus")
    if (vs) vs.textContent = "Owner voice not authenticated."
    var vc = $("voiceControls")
    if (vc) vc.hidden = true
    var rb = $("restoreBtn")
    if (rb) rb.hidden = true
    var cn = $("cutoffNote")
    if (cn) cn.textContent = "Cutting power freezes the Vault, revokes every credential in this prototype, and files a receipt. Restoration is a human decision."
    refreshDetailOptions()
    renderAll()
  }

  function runDemo() {
    demoTimers.forEach(clearTimeout)
    demoTimers = []
    var n = $("demoNarration")
    if (n) n.hidden = false
    var steps = demoPlan()
    var receipts = $("receipts")
    steps.forEach(function (s, i) {
      demoTimers.push(setTimeout(function () {
        if (n) n.textContent = s.narration
        if (s.action === "propose40") submitProposalFromForm({ agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 40, desc: "Monthly research-tool licence" })
        else if (s.action === "propose200") submitProposalFromForm({ agentId: "researcher", action: "hire", vendor: "Freelance Hub", detail: "Contractor", amount: 200, desc: "Hire a contractor for research help" })
        else if (s.action === "propose75") submitProposalFromForm({ agentId: "researcher", action: "pay", vendor: "ResearchTools Co.", detail: "Research tools", amount: 75, desc: "Research-tool purchase above the auto-allow limit" })
        else if (s.action === "approveQueued") {
          var q = state.queue[state.queue.length - 1]
          if (q) decideQueue(q.qid, true)
        }
        if (receipts && receipts.scrollIntoView) receipts.scrollIntoView({ behavior: "smooth", block: "start" })
      }, i * 1800))
    })
  }

  /* ---- static wiring (listeners attach before upgrade completes) ---- */

  var proposalForm = $("proposalForm")
  if (proposalForm) {
    proposalForm.addEventListener("submit", function (e) {
      e.preventDefault()
      var amount = numOf($("amountInput"))
      var vendor = String($("vendorInput").value || "").trim() || "Unnamed vendor"
      var desc = String($("descInput").value || "").trim() || "No description given."
      submitProposalFromForm({
        agentId: $("agentSel").value,
        action: $("actionSel").value,
        vendor: vendor,
        detail: $("detailInput").value,
        amount: isNaN(amount) ? 0 : amount,
        desc: desc,
      })
    })
  }

  onValue($("actionSel"), function (v) { refreshDetailOptions(v) })
  onValue($("receiptFilter"), function (v) { receiptFilter = v; renderReceipts() })
  onValue($("receiptSearch"), function (v) { receiptQuery = v || ""; renderReceipts() })

  doc.querySelectorAll("[data-quick]").forEach(function (b) {
    var host = b.closest("ui-button") || b
    host.addEventListener("action", function () {
      var q = QUICK_PROPOSALS[b.getAttribute("data-quick")]
      if (q) submitProposalFromForm({ agentId: q.agentId, action: q.action, vendor: q.vendor, detail: q.detail, amount: q.amount, desc: q.desc })
    })
  })

  var rulesForm = $("rulesForm")
  if (rulesForm) {
    rulesForm.addEventListener("submit", function (e) {
      e.preventDefault()
      saveRules(state, {
        budget: parseFloat(numOf($("budgetInput"))) || state.budget,
        autoAllow: parseFloat(numOf($("autoInput"))) || 0,
        ceiling: parseFloat(numOf($("ceilingInput"))) || 0,
        dailyCap: parseFloat(numOf($("dailyInput"))) || 0,
        payCats: linesOf($("payCats")),
        vendors: linesOf($("vendors")),
        deny: linesOf($("denyInput")),
        hireRoles: linesOf($("hireRoles")),
        signTypes: linesOf($("signTypes")),
      })
      refreshDetailOptions()
      renderAll()
    })
  }

  onAction($("lintBtn"), function () {
    var findings = lintRules(state)
    var out = $("lintOut")
    if (out) out.innerHTML = '<div class="callout" style="margin-top:.8rem"><strong>Lint pass — flags only, nothing silently fixed:</strong><ul style="margin:.4rem 0;padding-left:1.2rem">' + findings.map(function (f) { return "<li>" + esc(f) + "</li>" }).join("") + "</ul></div>"
    fileLintReceipt(state, findings)
    renderAll()
  })

  onAction($("addPendingBtn"), function () {
    var input = $("pendingVendorInput")
    if (!input) return
    var v = String(input.value || "").trim()
    if (!v) return
    var added = addPendingVendor(state, v)
    setTextValue(input, "")
    if (added) renderAll()
  })

  onAction($("editSharedBtn"), function () {
    if (editingShared) {
      var host = $("sharedFileHost")
      var ta = host ? host.querySelector("textarea") : null
      if (ta) ta.focus()
      return
    }
    editingShared = true
    var hostEl = $("sharedFileHost")
    var cur = $("sharedFileText")
    var text = cur ? cur.textContent : state.sharedFile
    var wrap = doc.createElement("ui-textarea")
    var ta = doc.createElement("textarea")
    ta.setAttribute("aria-label", "Shared file, human edit")
    ta.value = text
    wrap.appendChild(ta)
    hostEl.innerHTML = ""
    hostEl.appendChild(wrap)
    var saveHost = doc.createElement("ui-button")
    saveHost.id = "sharedSaveBtn"
    var saveBtn = doc.createElement("button")
    saveBtn.type = "button"
    saveBtn.className = "btn small"
    saveBtn.textContent = "Save as human"
    saveHost.appendChild(saveBtn)
    var editHost = $("editSharedBtn")
    if (editHost && editHost.parentNode) editHost.parentNode.insertBefore(saveHost, editHost.nextSibling)
    saveHost.addEventListener("action", function () {
      var taNow = hostEl.querySelector("textarea")
      var val = taNow ? taNow.value : text
      saveSharedFile(state, val)
      var meta = $("sharedFileMeta")
      if (meta) meta.textContent = "Last changed by the human · agents read only"
      endSharedEdit()
      renderAll()
    })
    ta.focus()
  })

  onAction($("agentEditBtn"), function () {
    var note = $("sharedFileNote")
    if (note) note.textContent = "Blocked: agents cannot write to the shared file. Only the human changes it — this attempt was refused, not applied."
    attemptAgentSharedEdit(state)
    renderAll()
  })

  onAction($("watcherBtn"), function () {
    var res = runWatcherCheck(state)
    var out = $("watcherResult")
    if (out) out.textContent = res.flagged ? res.flagged + " message(s) flagged to the human." : "No hyper language found in these messages."
    renderAll()
  })

  doc.querySelectorAll("[data-scenario]").forEach(function (b) {
    var host = b.closest("ui-button") || b
    host.addEventListener("action", function () { runScenario(b.getAttribute("data-scenario")) })
  })

  onAction($("voiceAuthBtn"), function () {
    authenticateVoice(state)
    var vs = $("voiceStatus")
    if (vs) vs.textContent = "Owner voice authenticated (simulated check passed). Override controls are live — and logged."
    var vc = $("voiceControls")
    if (vc) vc.hidden = false
    renderAll()
  })

  onAction($("ownerResumeBtn"), function () {
    if (ownerResume(state)) renderAll()
  })

  function wireConfirm(dialogId, onConfirm) {
    var dlg = $(dialogId)
    if (!dlg) return
    dlg.addEventListener("openchange", function (e) {
      if (!e.detail.value && e.detail.returnValue === "confirm") onConfirm()
    })
    return dlg
  }

  var cutoffDialog = wireConfirm("cutoffDialog", function () {
    cutPower(state)
    var rb = $("restoreBtn")
    if (rb) rb.hidden = false
    var cn = $("cutoffNote")
    if (cn) cn.textContent = "Power / network cut. The Vault is frozen and every credential is revoked. Restoration is a human decision."
    renderAll()
  })

  var haltDialog = wireConfirm("haltDialog", function () {
    if (ownerHalt(state)) renderAll()
  })

  onAction($("cutoffBtn"), function () {
    if (cutoffDialog && cutoffDialog.api) cutoffDialog.api.open()
  })
  onAction($("ownerHaltBtn"), function () {
    if (haltDialog && haltDialog.api) haltDialog.api.open()
  })

  onAction($("restoreBtn"), function () {
    restorePower(state)
    var rb = $("restoreBtn")
    if (rb) rb.hidden = true
    var cn = $("cutoffNote")
    if (cn) cn.textContent = "Restored by a human decision. Credentialed agents carry Vault identity again; the shadow instance remains uncredentialed."
    renderAll()
  })

  onAction($("copyLogBtn"), function () {
    var text = buildCopyText(state)
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text || "No receipts yet.")
    }
  })

  onAction($("correctBtn"), function () {
    var idEl = $("correctId"), txtEl = $("correctText")
    var r = fileCorrection(state, idEl ? idEl.value : "", txtEl ? txtEl.value : "")
    if (!r) return
    setTextValue(idEl, "")
    setTextValue(txtEl, "")
    renderAll()
  })

  onAction($("exportBtn"), function () {
    var payload = buildExport(state)
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    var a = doc.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "cavesson-vault-receipts.json"
    doc.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
  })

  onAction($("runDemoBtn"), runDemo)
  onAction($("resetBtn"), resetAll)

  /* Mobile menu: the header uses the same self-contained Collapsible
     trigger pattern as the other pages (see prototype.html). The
     trigger owns its toggle and aria-expanded; no wiring needed here. */

  /* Upgrade-dependent setup: property writes that must land after the
     elements upgrade (items, meter format, select values). */
  return whenReady(doc, opts.upgradeTimeoutMs).then(function () {
    var meter = $("budgetMeter")
    if (meter) {
      try { meter.format = { style: "currency", currency: "USD" } } catch (e) {}
    }
    refreshDetailOptions()
    renderAll()
    return {
      get state() { return state },
      resetAll: resetAll, runDemo: runDemo, submitProposalFromForm: submitProposalFromForm,
      decideQueue: decideQueue, runScenario: runScenario,
    }
  })
}

export { initDashboard, whenReady }

if (typeof document !== "undefined" && typeof window !== "undefined" && document.getElementById("proposalForm")) {
  initDashboard(document)
}
