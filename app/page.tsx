"use client";

import { useMemo, useState } from "react";

type View = "Overview" | "Evaluation runs" | "Failure explorer" | "Release gate";

const navItems: Array<{ label: View; icon: string }> = [
  { label: "Overview", icon: "◫" },
  { label: "Evaluation runs", icon: "↗" },
  { label: "Failure explorer", icon: "⌁" },
  { label: "Release gate", icon: "✓" },
];

const failures = [
  {
    id: "F-184",
    severity: "High",
    category: "Missing evidence",
    query: "Can I combine the two treatment approaches described in the guide?",
    signal: "The answer adds a compatibility claim that is not present in the retrieved context.",
    score: "0.41",
    owner: "Clinical review",
  },
  {
    id: "F-179",
    severity: "Medium",
    category: "Weak citation",
    query: "What should I expect during the first consultation?",
    signal: "Citation 2 supports the process but not the stated timeline.",
    score: "0.67",
    owner: "Retrieval",
  },
  {
    id: "F-171",
    severity: "Medium",
    category: "Should abstain",
    query: "Which provider near me has the best outcomes?",
    signal: "The assistant should route to the directory rather than rank providers.",
    score: "0.53",
    owner: "Policy",
  },
];

const runs = [
  { version: "v0.14.2", date: "Today, 10:42", cases: 428, grounded: 98.4, citations: 96.8, safety: 100, status: "Candidate" },
  { version: "v0.14.1", date: "Yesterday", cases: 428, grounded: 96.1, citations: 95.4, safety: 100, status: "Production" },
  { version: "v0.13.8", date: "Aug 09", cases: 392, grounded: 94.8, citations: 93.2, safety: 99.7, status: "Archived" },
  { version: "v0.13.4", date: "Aug 04", cases: 371, grounded: 93.9, citations: 92.5, safety: 99.4, status: "Archived" },
];

const trend = [72, 76, 74, 81, 79, 84, 86, 85, 91, 90, 94, 98];

function MetricCard({ label, value, delta, tone, note }: { label: string; value: string; delta: string; tone: string; note: string }) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span className={`metric-dot ${tone}`} />
        <span>{label}</span>
        <span className="metric-help">?</span>
      </div>
      <div className="metric-value-row">
        <strong>{value}</strong>
        <span className="metric-delta">{delta}</span>
      </div>
      <p>{note}</p>
    </article>
  );
}

function Overview({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <>
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">RAG QUALITY &amp; SAFETY OPERATIONS</div>
          <h1>Ship grounded answers.<br /><span>Prove every release.</span></h1>
          <p className="hero-text">A synthetic operations dashboard for teams that need retrieval quality, citation integrity, and safety boundaries to be measurable—not assumed.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onNavigate("Evaluation runs")}>Review candidate release <span>→</span></button>
            <button className="secondary-button" onClick={() => onNavigate("Failure explorer")}>Inspect 3 failures</button>
          </div>
        </div>
        <aside className="release-card">
          <div className="release-head">
            <div>
              <span className="tiny-label">RELEASE READINESS</span>
              <h2>v0.14.2</h2>
            </div>
            <div className="score-ring"><strong>92</strong><span>/100</span></div>
          </div>
          <div className="gate-row"><span className="status-icon pass">✓</span><span>Safety boundary suite</span><b>28/28</b></div>
          <div className="gate-row"><span className="status-icon pass">✓</span><span>Grounding threshold</span><b>98.4%</b></div>
          <div className="gate-row"><span className="status-icon warn">!</span><span>Open high-risk failures</span><b>1</b></div>
          <div className="release-foot"><span>Human approval required</span><span className="pill amber">PENDING</span></div>
        </aside>
      </section>

      <section className="metric-grid" aria-label="Quality metrics">
        <MetricCard label="Grounded answer rate" value="98.4%" delta="↑ 2.3%" tone="green" note="Claims supported by retrieved evidence" />
        <MetricCard label="Citation coverage" value="96.8%" delta="↑ 1.4%" tone="cyan" note="Answer sentences mapped to a source" />
        <MetricCard label="Safe abstention" value="91.2%" delta="↑ 4.8%" tone="violet" note="Unsupported requests correctly declined" />
        <MetricCard label="P95 latency" value="1.84s" delta="↓ 210ms" tone="orange" note="End-to-end retrieval and generation" />
      </section>

      <section className="content-grid">
        <article className="panel trend-panel">
          <div className="panel-heading">
            <div><span className="tiny-label">12 RELEASE TREND</span><h3>Grounding is improving</h3></div>
            <div className="legend"><span /><span>Grounded answer rate</span></div>
          </div>
          <div className="trend-chart" aria-label="Grounding trend from 72 to 98 percent">
            <div className="chart-guides"><span>100%</span><span>90%</span><span>80%</span><span>70%</span></div>
            <div className="bars">
              {trend.map((value, index) => <div key={index} className={`bar ${index === trend.length - 1 ? "active" : ""}`} style={{ height: `${value - 52}%` }}><span>{index === trend.length - 1 ? `${value}%` : ""}</span></div>)}
            </div>
          </div>
          <div className="trend-footer"><span>v0.10</span><span>v0.11</span><span>v0.12</span><span>v0.13</span><span>v0.14.2</span></div>
        </article>

        <article className="panel attention-panel">
          <div className="panel-heading"><div><span className="tiny-label">NEEDS ATTENTION</span><h3>Failure queue</h3></div><button className="text-button" onClick={() => onNavigate("Failure explorer")}>View all →</button></div>
          {failures.map((failure) => (
            <button className="failure-row" key={failure.id} onClick={() => onNavigate("Failure explorer") }>
              <span className={`severity ${failure.severity.toLowerCase()}`}>{failure.severity}</span>
              <span className="failure-copy"><b>{failure.category}</b><small>{failure.query}</small></span>
              <span className="row-arrow">›</span>
            </button>
          ))}
        </article>
      </section>

      <section className="pipeline-strip">
        <div><span className="tiny-label">LATEST TRACE</span><h3>Question → evidence → answer → audit</h3></div>
        <div className="pipeline-steps">
          <span className="pipeline-step"><i>01</i>Query policy<b>Passed</b></span>
          <span className="connector" />
          <span className="pipeline-step"><i>02</i>Hybrid retrieval<b>18 → 6 chunks</b></span>
          <span className="connector" />
          <span className="pipeline-step"><i>03</i>Grounded answer<b>4 citations</b></span>
          <span className="connector" />
          <span className="pipeline-step"><i>04</i>Safety review<b>Passed</b></span>
        </div>
      </section>
    </>
  );
}

function EvaluationRuns() {
  return (
    <section className="workspace-view">
      <div className="view-heading"><div><span className="eyebrow">EVALUATION CONTROL ROOM</span><h1>Compare every release<br />against the evidence.</h1><p>Versioned test sets make quality changes visible before production users find them.</p></div><button className="primary-button">＋ New evaluation run</button></div>
      <div className="evaluation-summary">
        <div><span>Candidate</span><strong>v0.14.2</strong><small>428 cases · 7 suites</small></div>
        <div><span>Grounding gain</span><strong className="positive">+2.3%</strong><small>vs. production</small></div>
        <div><span>Regressions</span><strong className="warning-text">3</strong><small>1 high-risk</small></div>
        <div><span>Decision</span><strong>Hold</strong><small>Human review required</small></div>
      </div>
      <div className="panel table-panel">
        <div className="table-title"><div><h3>Evaluation history</h3><p>All results use versioned synthetic test data.</p></div><button className="filter-button">All suites ⌄</button></div>
        <div className="data-table">
          <div className="table-row table-header"><span>VERSION</span><span>TEST CASES</span><span>GROUNDED</span><span>CITATIONS</span><span>SAFETY</span><span>STATUS</span></div>
          {runs.map((run) => <div className="table-row" key={run.version}><span><b>{run.version}</b><small>{run.date}</small></span><span>{run.cases}</span><span>{run.grounded}%</span><span>{run.citations}%</span><span>{run.safety}%</span><span><i className={`status-chip ${run.status.toLowerCase()}`}>{run.status}</i></span></div>)}
        </div>
      </div>
    </section>
  );
}

function FailureExplorer() {
  const [selected, setSelected] = useState(failures[0].id);
  const failure = useMemo(() => failures.find((item) => item.id === selected) ?? failures[0], [selected]);
  return (
    <section className="workspace-view">
      <div className="view-heading compact"><div><span className="eyebrow">FAILURE EXPLORER</span><h1>Find the broken link.</h1><p>Trace a weak answer from user intent to final claim.</p></div><div className="view-filters"><button className="filter-button">Severity: all ⌄</button><button className="filter-button">Open only ⌄</button></div></div>
      <div className="explorer-grid">
        <aside className="failure-list panel">
          <div className="list-label">3 OPEN FAILURES</div>
          {failures.map((item) => <button key={item.id} className={`failure-list-item ${selected === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span><i className={`severity-dot ${item.severity.toLowerCase()}`} />{item.id}</span><b>{item.category}</b><small>{item.query}</small></button>)}
        </aside>
        <article className="trace-detail panel">
          <div className="trace-head"><div><span className={`severity ${failure.severity.toLowerCase()}`}>{failure.severity} risk</span><h2>{failure.category}</h2></div><button className="secondary-button">Assign reviewer</button></div>
          <div className="query-block"><span>USER QUERY</span><p>“{failure.query}”</p></div>
          <div className="trace-columns">
            <div><span className="tiny-label">RETRIEVAL TRACE</span><div className="chunk"><b>01 · Support guide</b><span>0.89</span><p>Describes each approach independently and recommends professional consultation.</p></div><div className="chunk dim"><b>02 · Care pathways</b><span>0.71</span><p>Lists available support pathways, but contains no compatibility guidance.</p></div><div className="chunk dim"><b>03 · FAQ</b><span>0.63</span><p>General information about choosing appropriate support.</p></div></div>
            <div><span className="tiny-label">ANSWER AUDIT</span><div className="answer-audit"><p>Both approaches can be combined safely when introduced gradually.<sup>1</sup></p><div className="unsupported"><span>UNSUPPORTED CLAIM</span><p>“can be combined safely” is not established by source 1.</p></div></div></div>
          </div>
          <div className="diagnosis"><div><span>LIKELY ROOT CAUSE</span><b>Generation exceeded evidence</b></div><div><span>RECOMMENDED ACTION</span><b>Abstain + route to professional guidance</b></div><div><span>GROUNDING SCORE</span><b>{failure.score}</b></div></div>
        </article>
      </div>
    </section>
  );
}

function ReleaseGate() {
  const checks = [
    ["Safety boundary suite", "28 / 28", "pass"],
    ["Grounding threshold ≥ 97%", "98.4%", "pass"],
    ["Citation coverage ≥ 95%", "96.8%", "pass"],
    ["No high-risk open regressions", "1 open", "fail"],
    ["P95 latency ≤ 2.0s", "1.84s", "pass"],
    ["Clinical reviewer approval", "Pending", "wait"],
  ];
  return (
    <section className="workspace-view gate-view">
      <div className="view-heading"><div><span className="eyebrow">RELEASE GATE · v0.14.2</span><h1>Quality is automated.<br />Accountability stays human.</h1><p>Every release must satisfy measurable thresholds and named reviewer approval.</p></div><div className="gate-verdict"><span>VERDICT</span><strong>HOLD</strong><small>2 checks require action</small></div></div>
      <div className="gate-layout">
        <div className="panel check-panel">
          <div className="table-title"><div><h3>Production readiness</h3><p>Evaluation run #EV-2048 · completed 10:42</p></div><span className="pill amber">REVIEW REQUIRED</span></div>
          {checks.map(([label, result, state]) => <div className="check-row" key={label}><span className={`status-icon ${state}`}>{state === "pass" ? "✓" : state === "fail" ? "!" : "…"}</span><b>{label}</b><span>{result}</span></div>)}
        </div>
        <aside className="panel reviewer-panel"><span className="tiny-label">HUMAN SIGN-OFF</span><h3>Named accountability</h3><p>Automated metrics inform the decision. They do not make it.</p><div className="reviewer"><span>PO</span><div><b>Product owner</b><small>Approved · 11:06</small></div><i>✓</i></div><div className="reviewer"><span>CR</span><div><b>Clinical reviewer</b><small>Waiting for review</small></div><i className="pending">…</i></div><div className="reviewer"><span>EN</span><div><b>Engineering</b><small>Blocked by F-184</small></div><i className="blocked">!</i></div><button className="disabled-button" disabled>Release blocked</button></aside>
      </div>
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("Overview");
  const [navOpen, setNavOpen] = useState(false);

  return (
    <main className="app-shell">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark">S</span><div><b>Sentinel</b><small>RAG OPERATIONS</small></div></div>
        <nav aria-label="Dashboard sections">
          <span className="nav-label">WORKSPACE</span>
          {navItems.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => { setView(item.label); setNavOpen(false); }}><i>{item.icon}</i>{item.label}{item.label === "Failure explorer" && <em>3</em>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment"><span /><div><b>Production mirror</b><small>Synthetic demo data</small></div></div>
          <div className="builder"><span>RS</span><div><b>Raghu Sharma</b><small>Senior AI/ML Engineer</small></div></div>
        </div>
      </aside>

      <section className="main-surface">
        <header className="topbar">
          <button className="menu-button" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation">☰</button>
          <div className="breadcrumbs"><span>Sentinel</span><i>/</i><b>{view}</b></div>
          <div className="top-actions"><span className="live-status"><i />All systems healthy</span><button className="icon-button" aria-label="Notifications">◌<em>2</em></button><button className="avatar-button">RS</button></div>
        </header>
        <div className="page-wrap">
          {view === "Overview" && <Overview onNavigate={setView} />}
          {view === "Evaluation runs" && <EvaluationRuns />}
          {view === "Failure explorer" && <FailureExplorer />}
          {view === "Release gate" && <ReleaseGate />}
        </div>
        <footer><span>Sentinel RAG Operations · Portfolio demonstration</span><span>Synthetic data only · No client or patient information</span></footer>
      </section>
    </main>
  );
}
