// Static markup + source checks for the rebuilt prototype: no UI SDK
// runtime needed. Parses prototype.html and reads dashboard.js/css as text.
// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const html = readFileSync(join(root, "prototype.html"), "utf8")
const js = readFileSync(join(root, "dashboard.js"), "utf8")
const css = readFileSync(join(root, "dashboard.css"), "utf8")

function doc() {
  const parser = new DOMParser()
  return parser.parseFromString(html, "text/html")
}

describe("locked copy + honest status", () => {
  test("locked lines appear verbatim", () => {
    expect(html).toContain("Your data stays home.")
    expect(html).toContain("Machines propose, but humans are the source of all decisions.")
  })
  test("honest-status labels are all present", () => {
    expect(html).toContain("Working prototype")
    expect(html).toContain("Simulated money, simulated agents")
    expect(html).toContain("Nothing here spends, hires, or signs anything real")
    expect(html).toContain("not a live-money demo")
    expect(html).toContain("Everything on this page lives only in this tab, in memory, for this session")
    expect(html).toContain("No real money, no real hiring, no real signatures, no data sent anywhere")
    expect(html).toContain("not yet implemented as shipped product")
  })
  test("no price, no Glenride claim", () => {
    expect(html).not.toMatch(/Glenride/)
    expect(html).not.toMatch(/\$\d+\/mo|per month|buy now|checkout/i)
  })
})

describe("capability-baseline fixes", () => {
  test("C1: no approval-timeout assertion anywhere in the page or dashboard script", () => {
    expect(html.toLowerCase()).not.toContain("timeout")
    expect(js).not.toContain("Approval timeout")
    expect(js).not.toContain("timeouts also count")
    expect(js).toContain('reason: "Human declined. " + p.desc')
    expect(html).toContain("A proposal waits until the human decides. It does not quietly become permission.")
  })
  test("C2: walkthrough states the $500 budget with a $50 auto-allow limit", () => {
    expect(html).toContain("The Human sets a $500 budget with a $50 auto-allow limit and an allowlist")
    expect(html).not.toContain("sets a $50 budget")
    expect(js).toContain("budget: 500")
    expect(js).toContain("autoAllow: 50")
  })
})

describe("no persistence, no network", () => {
  test("dashboard.js never persists or fetches", () => {
    expect(js).not.toContain("localStorage")
    expect(js).not.toContain("sessionStorage")
    expect(js).not.toContain("fetch(")
    expect(js).not.toContain("XMLHttpRequest")
    expect(js).not.toContain("navigator.sendBeacon")
  })
  test("prototype.html loads the SDK runtime, auth, dashboard, and styles in order", () => {
    expect(html).toContain('<script type="module" src="assets/ui-sdk/web.js"></script>')
    expect(html).toContain('<script src="auth.js"></script>')
    expect(html).toContain('<script type="module" src="dashboard.js"></script>')
    const stylesIdx = html.indexOf('href="styles.css')
    const dashIdx = html.indexOf('href="dashboard.css"')
    expect(stylesIdx).toBeGreaterThan(-1)
    expect(dashIdx).toBeGreaterThan(stylesIdx)
    expect(html).toContain('href="fonts/fonts.css"')
  })
  test("no inline script blocks: all behavior is external", () => {
    const scripts = [...html.matchAll(/<script[^>]*>/g)]
    expect(scripts.length).toBe(3)
    for (const s of scripts) expect(s[0]).toContain("src=")
  })
  test("header keeps the auth area and the site chrome", () => {
    const d = doc()
    expect(d.getElementById("auth-area")).not.toBeNull()
    expect(d.querySelector(".wordmark").textContent).toBe("Cavesson")
    const links = [...d.querySelectorAll(".site-nav a")].map((a) => a.textContent)
    expect(links).toEqual(["Home", "Vault", "Architecture", "Story", "Status"])
    expect(d.querySelector(".site-nav a[aria-current]")).toBeNull()
    expect(d.querySelector(".skip-link")).not.toBeNull()
    expect(d.querySelector("main#main")).not.toBeNull()
  })
})

describe("required ids", () => {
  const ids = [
    "vaultState", "statRemaining", "statSpent", "budgetMeter", "statPending",
    "statStopped", "statReceipts", "runDemoBtn", "resetBtn", "exportBtn",
    "demoNarration", "proposalForm", "agentSel", "actionSel", "vendorInput",
    "vendorList", "detailLabel", "detailInput", "amountInput", "descInput",
    "lastCheck", "pendingPill", "queue", "ruleVersionPill", "rulesForm",
    "budgetInput", "autoInput", "ceilingInput", "dailyInput", "payCats",
    "vendors", "denyInput", "hireRoles", "signTypes", "lintBtn", "lintOut",
    "pendingVendorInput", "addPendingBtn", "pendingVendors", "agentCards",
    "sharedFileMeta", "sharedFileHost", "sharedFileText", "editSharedBtn",
    "agentEditBtn", "sharedFileNote", "watcherMessages", "watcherBtn",
    "watcherResult", "voiceAuthBtn", "voiceStatus", "voiceControls",
    "ownerHaltBtn", "ownerResumeBtn", "cutoffBtn", "restoreBtn", "cutoffNote",
    "defenseLog", "cutoffDialog", "haltDialog", "receiptSearch", "receiptFilter",
    "copyLogBtn", "receiptList", "receiptTimeline", "receiptEmpty",
    "correctId", "correctText", "correctBtn", "notifications",
  ]
  test.each(ids)("id #%s exists exactly once", (id) => {
    const d = doc()
    expect(d.querySelectorAll("#" + id)).toHaveLength(1)
  })
})

describe("UI SDK components used", () => {
  test("all planned components appear", () => {
    const d = doc()
    for (const tag of ["ui-button", "ui-field", "ui-select", "ui-number-input", "ui-input", "ui-textarea", "ui-meter", "ui-timeline", "ui-accordion", "ui-collapsible", "ui-alert-dialog", "ui-toast-region"]) {
      expect(d.querySelectorAll(tag).length, tag).toBeGreaterThan(0)
    }
  })
  test("no invented mode control: no segmented control, tabs, dialog, or switch", () => {
    const d = doc()
    expect(d.querySelectorAll("ui-segmented-control")).toHaveLength(0)
    expect(d.querySelectorAll("ui-tabs")).toHaveLength(0)
    expect(d.querySelectorAll("ui-dialog")).toHaveLength(0)
    expect(d.querySelectorAll("ui-switch")).toHaveLength(0)
    expect(d.querySelectorAll("ui-listbox")).toHaveLength(0)
  })
  test("four selects: two data-driven with templates, two with static items", () => {
    const d = doc()
    const selects = d.querySelectorAll("ui-select")
    expect(selects).toHaveLength(4)
    expect(d.querySelector("#agentSel template")).not.toBeNull()
    expect(d.querySelector("#detailInput template")).not.toBeNull()
    expect(d.querySelectorAll("#actionSel ui-select-item")).toHaveLength(3)
    expect(d.querySelectorAll("#receiptFilter ui-select-item")).toHaveLength(5)
  })
  test("accordion has all seven layers open by default", () => {
    const d = doc()
    const acc = d.querySelector("ui-accordion")
    expect(acc.hasAttribute("multiple")).toBe(true)
    expect(acc.getAttribute("default-value")).toBe("layer0,layer1,layer2,layer3,layer4,layer5,layer6")
    expect(d.querySelectorAll("ui-accordion-item")).toHaveLength(7)
    expect(d.querySelectorAll("ui-accordion-panel[hidden]")).toHaveLength(0)
  })
  test("alert dialogs carry confirm closes", () => {
    const d = doc()
    for (const id of ["cutoffDialog", "haltDialog"]) {
      const dlg = d.getElementById(id)
      expect(dlg.querySelector("ui-alert-dialog-backdrop[hidden]")).not.toBeNull()
      expect(dlg.querySelector("ui-alert-dialog-content[hidden]")).not.toBeNull()
      expect(dlg.querySelector('ui-alert-dialog-close[value="confirm"]')).not.toBeNull()
      expect(dlg.querySelectorAll("ui-alert-dialog-close")).toHaveLength(2)
    }
  })
  test("meter has track + indicator and an accessible name", () => {
    const d = doc()
    const meter = d.getElementById("budgetMeter")
    expect(meter.getAttribute("aria-label")).toBe("Budget spent")
    expect(meter.querySelector("ui-meter-track > ui-meter-indicator")).not.toBeNull()
  })
  test("toast region has a template with title, description, and close", () => {
    const d = doc()
    const region = d.getElementById("notifications")
    expect(region.getAttribute("aria-label")).toBe("Notifications")
    expect(region.getAttribute("side")).toBe("bottom")
    expect(region.getAttribute("align")).toBe("end")
    const tpl = region.querySelector("template")
    expect(tpl.content.querySelector("ui-toast-title")).not.toBeNull()
    expect(tpl.content.querySelector("ui-toast-description")).not.toBeNull()
    expect(tpl.content.querySelector("ui-toast-close")).not.toBeNull()
  })
  test("number inputs use step 0.01 for money and step 1 for rules", () => {
    const d = doc()
    expect(d.getElementById("amountInput").getAttribute("step")).toBe("0.01")
    for (const id of ["budgetInput", "autoInput", "ceilingInput", "dailyInput"]) {
      expect(d.getElementById(id).getAttribute("step")).toBe("1")
    }
  })
  test("vendor input keeps its datalist", () => {
    const d = doc()
    const input = d.querySelector("#vendorInput input")
    expect(input.getAttribute("list")).toBe("vendorList")
    expect(d.getElementById("vendorList").tagName).toBe("DATALIST")
  })
})

describe("every control named", () => {
  test("every button has text or an aria-label", () => {
    const d = doc()
    for (const b of d.querySelectorAll("button")) {
      const name = (b.textContent || "").trim() || b.getAttribute("aria-label") || ""
      expect(name.length, b.outerHTML.slice(0, 80)).toBeGreaterThan(0)
    }
  })
  test("every field has a label", () => {
    const d = doc()
    for (const f of d.querySelectorAll("ui-field")) {
      expect(f.querySelector("ui-field-label")).not.toBeNull()
      expect(f.querySelector("ui-field-label").textContent.trim().length).toBeGreaterThan(0)
    }
  })
  test("every stepper button is named", () => {
    const d = doc()
    for (const part of d.querySelectorAll("ui-number-input-decrement button, ui-number-input-increment button")) {
      expect(part.getAttribute("aria-label")).toBeTruthy()
    }
  })
})

describe("dashboard.css", () => {
  test("opens with the ui-sdk layer and styles from data-slot", () => {
    expect(css.startsWith("@layer ui-sdk;")).toBe(true)
    expect(css).toContain('[data-slot="select-trigger"]')
    expect(css).toContain('[data-slot="meter-indicator"]')
    expect(css).toContain('[data-slot="timeline-item"]')
    expect(css).toContain('[data-slot="accordion-trigger"]')
    expect(css).toContain('[data-slot="alert-dialog-content"]')
    expect(css).toContain('[data-slot="toast-region"]')
  })
  test("does not redefine the shared tokens", () => {
    expect(css).not.toContain("--paper:")
    expect(css).not.toContain("--sienna:")
    expect(css).not.toContain("--ink:")
    expect(css).toContain("var(--paper)")
    expect(css).toContain("var(--sienna-fill)")
  })
  test("sienna fills use the fill token, sienna text uses the text token", () => {
    expect(css).toContain(".btn.sienna")
    expect(css).toMatch(/\.btn\.sienna \{[^}]*background: var\(--sienna-fill\)/)
  })
})
