/* Agent Governance Console - mock data layer.
   Everything here is sample data for Meridian Consumer Brands (fictional demo tenant).
   Shape mirrors what the GCP ingestion layer will eventually produce:
     BusinessProcess  -> BPS
     Agent (Agent.md) -> AGENTS (inputs / tools / outputs / users / instructions / guardrails)
     Usage telemetry  -> agent.use (Cloud Trace + Cloud Logging + BigQuery billing export)
   Tuples keep the file compact; app.js normalizes them into objects. */

window.TENANT = { name: 'Meridian Consumer Brands', note: 'Demo tenant · sample data', asOf: 'Nov 18, 2026, 23:59 ET' };

window.TIERS = {
  1: { name: 'Core value-creating', short: 'Tier 1 · Core', question: 'How do we create and deliver value to make money?' },
  2: { name: 'Enabling & support', short: 'Tier 2 · Enabling', question: 'How do we supply the people, cash, tools and materials needed to operate?' },
  3: { name: 'Governance & strategy', short: 'Tier 3 · Governance', question: 'Where are we going, how do we stay safe, and how do we get better?' }
};

/* Illustrative list prices, USD per 1M tokens. Replace with the tenant's billing export rates. */
window.MODEL_PRICES = {
  'gemini-3-pro':   { in: 2.00, out: 12.00, label: 'Gemini 3 Pro' },
  'gemini-3-flash': { in: 0.50, out: 3.00,  label: 'Gemini 3 Flash' }
};
/* Illustrative Agent Engine runtime cost per invocation, by archetype. */
window.RUNTIME_PER_INVOCATION = { automation: 0.0012, conversational: 0.0045, analytical: 0.0060, monitoring: 0.0020 };

window.BPS = [
  /* ---------------- Tier 1 ---------------- */
  { id: 'i2m', code: 'I2M', name: 'Idea-to-Market', alt: 'Concept-to-Launch', tier: 1,
    owner: 'Elena Marsh', ownerTitle: 'Chief R&D Officer',
    summary: 'Researching, designing, prototyping, testing and launching new products. Agents here support R&D scientists and brand teams from consumer insight through claims sign-off.',
    subs: ['Consumer research', 'Formulation', 'Prototyping', 'Claims & testing', 'Launch'] },
  { id: 'l2o', code: 'L2O', name: 'Lead-to-Order', alt: 'Campaign-to-Lead', tier: 1,
    owner: 'Marcus Bell', ownerTitle: 'Chief Commercial Officer',
    summary: 'Marketing outreach, retail media, account planning and converting retailer interest into orders. Trade promotion planning sits here too.',
    subs: ['Campaigns', 'Retail media', 'Account planning', 'Trade promotion', 'Opportunity management'] },
  { id: 'q2c', code: 'Q2C', name: 'Quote-to-Cash', alt: 'Q2C', tier: 1,
    owner: 'Sofia Alvarez', ownerTitle: 'VP Pricing & Revenue Management',
    summary: 'Configuring complex deals, pricing, contract negotiation and quote approval for distributor and national-account business.',
    subs: ['Deal configuration', 'Pricing', 'Quote approval', 'Contract negotiation'] },
  { id: 'o2c', code: 'O2C', name: 'Order-to-Cash', alt: 'O2C', tier: 1, featured: true,
    owner: 'Priya Raman', ownerTitle: 'VP Customer Operations',
    summary: 'Everything from a confirmed customer order to cash in the bank: order capture, credit checks, billing, retailer deductions, collections and cash application. About 70% of Meridian’s order volume arrives as retailer EDI and 30% through the direct-to-consumer storefront.',
    subs: ['Order capture', 'Credit management', 'Billing', 'Deductions & disputes', 'Collections', 'Cash application'] },
  { id: 'f2s', code: 'F2S', name: 'Plan-to-Produce', alt: 'Forecast-to-Stock', tier: 1,
    owner: 'Tomasz Nowak', ownerTitle: 'VP Integrated Supply Planning',
    summary: 'Demand forecasting, supply planning, raw material scheduling, manufacturing and quality control across five plants.',
    subs: ['Demand sensing', 'Supply planning', 'Production scheduling', 'Quality control'] },
  { id: 'i2d', code: 'I2D', name: 'Inventory-to-Deliver', alt: 'Order-to-Fulfill', tier: 1,
    owner: 'Grace Okafor', ownerTitle: 'VP Logistics',
    summary: 'Warehousing, stock management, picking and packing, transportation and final-mile delivery through 9 distribution centers.',
    subs: ['Warehousing', 'Slotting', 'Transportation', 'Final mile'] },
  { id: 'i2r', code: 'I2R', name: 'Issue-to-Resolution', alt: 'Request-to-Resolve', tier: 1,
    owner: 'Hannah Lindqvist', ownerTitle: 'Director, Customer Care',
    summary: 'Customer onboarding, support, troubleshooting, warranty claims and returns (reverse logistics) for retail and consumer customers.',
    subs: ['Case handling', 'Order inquiries', 'Returns & RMAs', 'Warranty'] },

  /* ---------------- Tier 2 ---------------- */
  { id: 'p2p', code: 'P2P', name: 'Procure-to-Pay', alt: 'Source-to-Pay', tier: 2,
    owner: 'Daniel Cho', ownerTitle: 'Chief Procurement Officer',
    summary: 'Sourcing suppliers, negotiating contracts, requisitions and purchase orders, goods receipt and paying vendor invoices.',
    subs: ['Sourcing', 'Purchasing', 'Invoice processing', 'Supplier risk', 'Payments'] },
  { id: 'r2r', code: 'R2R', name: 'Record-to-Report', alt: 'R2R', tier: 2, featured: true,
    owner: 'Nathaniel Brooks', ownerTitle: 'Corporate Controller',
    summary: 'Turning every transaction into the books and the financial statements: journal entries, reconciliations, intercompany, accruals, the month-end close, tax and external reporting. It is the most data-dense process in the company, since every other process eventually posts into the general ledger.',
    subs: ['Journal entries', 'Account reconciliation', 'Intercompany', 'Accruals & revenue', 'Month-end close', 'Tax', 'External reporting'] },
  { id: 'h2r', code: 'H2R', name: 'Hire-to-Retire', alt: 'H2R', tier: 2,
    owner: 'Aisha Rahman', ownerTitle: 'Chief People Officer',
    summary: 'Workforce planning, recruiting, onboarding, payroll, benefits, performance, training and offboarding.',
    subs: ['Recruiting', 'Onboarding', 'Payroll', 'Performance', 'Learning'] },
  { id: 'a2r', code: 'A2R', name: 'Acquire-to-Retire', alt: 'Asset lifecycle', tier: 2,
    owner: 'Luis Ferreira', ownerTitle: 'VP Engineering & Maintenance',
    summary: 'Buying capital equipment and real estate, installation, preventive maintenance, depreciation and disposal.',
    subs: ['Capital projects', 'Maintenance', 'Depreciation', 'Disposal'] },
  { id: 'r2d', code: 'R2D', name: 'Request-to-Deploy', alt: 'IT service & change', tier: 2,
    owner: 'Kevin Osei', ownerTitle: 'VP IT Operations',
    summary: 'Employee IT tickets, software provisioning, access, system upgrades, security monitoring and data management.',
    subs: ['Service desk', 'Access management', 'Change management', 'Data management'] },
  { id: 'c2c', code: 'C2C', name: 'Contract-to-Compliance', alt: 'Legal operations', tier: 2,
    owner: 'Rebecca Stein', ownerTitle: 'General Counsel',
    summary: 'Drafting vendor and customer agreements, IP protection and contract lifecycle tracking.',
    subs: ['Drafting & review', 'Obligations', 'IP', 'Regulatory counsel'] },

  /* ---------------- Tier 3 ---------------- */
  { id: 's2e', code: 'S2E', name: 'Strategy-to-Execution', alt: 'S2E', tier: 3,
    owner: 'Olivia Grant', ownerTitle: 'CFO',
    summary: 'Long-term planning, budgeting, capital allocation, M&A and company-wide OKRs and KPIs.',
    subs: ['Planning & budgeting', 'Forecasting', 'Capital allocation', 'M&A'] },
  { id: 'id2m', code: 'ID2M', name: 'Identify-to-Mitigate', alt: 'Enterprise risk & compliance', tier: 3,
    owner: 'Samuel Adeyemi', ownerTitle: 'Chief Risk & Compliance Officer',
    summary: 'Regulatory monitoring, internal audit, fraud prevention, EHS and business continuity.',
    subs: ['Regulatory monitoring', 'Internal audit', 'Fraud prevention', 'EHS', 'Business continuity'] },
  { id: 'm2i', code: 'M2I', name: 'Measure-to-Improve', alt: 'Continuous improvement', tier: 3,
    owner: 'Yuki Tanaka', ownerTitle: 'Director, Operational Excellence',
    summary: 'Process mining, Lean and Six Sigma, root-cause analysis and change management.',
    subs: ['Process mining', 'Lean / Six Sigma', 'Root-cause analysis', 'Change management'] },
  { id: 's2v', code: 'S2V', name: 'Stakeholder-to-Value', alt: 'Investor & public relations', tier: 3,
    owner: 'Charlotte Dubois', ownerTitle: 'VP Investor Relations',
    summary: 'Board governance, shareholder reporting, ESG and corporate communications.',
    subs: ['Board governance', 'Investor relations', 'ESG reporting', 'Communications'] }
];

/* ------------------------------------------------------------------------------------------
   AGENTS
   inputs : [system, what, bp, mode]              mode r = reads, w = writes
   tools  : [name, description, system, bp, mode, approvalBy, weight]
   outputs: [destination, what, bp, mode]
   users  : [bp, role, people]                    first row with the most people = primary
   use    : rpd = API requests/day (model + tool calls), ms = share that are model calls,
            tin/tout = tokens per model call, inv = invocations in 30 days,
            pat = daily pattern, trend = growth over the 30 days, err = error %, p95 = ms
   fees   : [label, unit, unitRate, quantity30d]
------------------------------------------------------------------------------------------- */
window.AGENTS = [

/* =============================== ORDER-TO-CASH =============================== */
{
  id: 'o2c-intake', name: 'Order Intake Agent', home: 'o2c', status: 'production',
  arch: 'automation', auto: 3, health: 'healthy',
  owner: 'Dana Whitfield', ownerTitle: 'Director, Order Management',
  version: '2.4.1', deployed: '2026-03-09', updated: '2026-11-04',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.1,
  trigger: 'Event: each new order on Pub/Sub topic orders-inbound (storefront checkout or EDI 850)',
  short: 'Turns every web and EDI order into a validated SAP sales order, then feeds the booked order to Finance for revenue recognition.',
  desc: 'Runs once per inbound order. It validates the customer, checks availability, applies contract pricing and creates the SAP sales order. Orders it cannot place cleanly go to a human exception queue. Every booked order is also written to the finance revenue dataset, which is why Record-to-Report depends on it.',
  inputs: [
    ['Salesforce Commerce Cloud', 'Direct-to-consumer storefront orders', 'o2c', 'r'],
    ['SAP S/4HANA · EDI inbound', 'Retailer purchase orders (EDI 850)', 'o2c', 'r'],
    ['SAP S/4HANA · Customer master', 'Sold-to / ship-to accounts, blocks', 'o2c', 'r'],
    ['SAP S/4HANA · ATP', 'Available-to-promise by DC', 'i2d', 'r'],
    ['SAP S/4HANA · Pricing conditions', 'Contract and list prices', 'q2c', 'r']
  ],
  tools: [
    ['validate_customer_account', 'Checks sold-to/ship-to exist, are unblocked and match the PO.', 'SAP S/4HANA · Customer master', 'o2c', 'r', '', 3],
    ['check_available_to_promise', 'Confirms quantity and date per line, per distribution center.', 'SAP S/4HANA · ATP', 'i2d', 'r', '', 4],
    ['apply_pricing_conditions', 'Returns the condition price for each line; never overrides.', 'SAP S/4HANA · Pricing', 'q2c', 'r', '', 3],
    ['create_sales_order', 'Creates the SD sales order and returns the order number.', 'SAP S/4HANA · SD', 'o2c', 'w', '', 2],
    ['route_exception_to_queue', 'Opens an order-exception case with the reason and the draft order.', 'Salesforce Service Cloud', 'i2r', 'w', '', 1],
    ['publish_booked_order', 'Writes the booked-order event for revenue recognition.', 'BigQuery · finance_revenue.booked_orders', 'r2r', 'w', '', 2]
  ],
  outputs: [
    ['SAP S/4HANA · Sales orders', 'Validated, priced sales orders', 'o2c', 'w'],
    ['BigQuery · finance_revenue.booked_orders', 'Booked-order events used by Revenue Accounting', 'r2r', 'w'],
    ['Salesforce Service Cloud · Order exceptions', 'Orders needing a human, with the reason', 'i2r', 'w']
  ],
  users: [
    ['o2c', 'Order management specialists', 38],
    ['i2r', 'Customer care reps working exceptions', 12],
    ['r2r', 'Revenue accountants', 7]
  ],
  instr: `You are the Order Intake Agent for Meridian Consumer Brands. You turn inbound customer orders into valid SAP sales orders.

Each run receives exactly one order: a storefront order from Salesforce Commerce Cloud or a retailer EDI 850 purchase order.

1. Validate the sold-to and ship-to accounts with validate_customer_account. If either is blocked or missing, do not create the order. Call route_exception_to_queue with reason ACCOUNT.
2. Check every line with check_available_to_promise. If a line cannot ship by the requested date, keep it on the order with the confirmed date and set the partial-ship flag.
3. Price every line with apply_pricing_conditions. Never change a price. If the PO price differs from the condition price by more than 2%, route the order with reason PRICE.
4. Create the order with create_sales_order.
5. After the order exists, call publish_booked_order so Revenue Accounting receives the booked-order event.

Never create an order worth more than $250,000; route it with reason VALUE.
Never edit customer master data.
Return only the OrderIntakeResult JSON schema.`,
  guard: [
    'Orders above $250,000 always go to a human (route reason VALUE).',
    'Price variance above 2% versus SAP conditions is routed, never accepted.',
    'No writes to customer master data; tool scope is limited to SD order creation.',
    'Model Armor screens EDI free-text fields for prompt injection before the model sees them.',
    'Consumer email and phone are masked in logs and traces.',
    'Three failed tool calls end the run and open an exception case.'
  ],
  use: { rpd: 18400, ms: 0.35, tin: 3200, tout: 380, inv: 96200, pat: 'web', trend: 0.06, err: 0.6, p95: 2800 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-intake', 'BigQuery billing export · label agent_id=o2c-intake', 'Pub/Sub subscription metrics']
},
{
  id: 'o2c-credit', name: 'Credit Risk Agent', home: 'o2c', status: 'production',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Martin Keane', ownerTitle: 'Credit Manager, North America',
  version: '1.7.0', deployed: '2026-05-18', updated: '2026-10-27',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.2,
  trigger: 'Event: SAP credit block on an order, or a new-customer credit application',
  short: 'Reviews orders stuck on credit hold, pulls exposure and payment history, and recommends release or hold for a credit analyst to approve.',
  desc: 'When SAP blocks an order for credit, the agent assembles the case: current exposure, D&B score, 12-month payment behavior and any fraud flags. It recommends release, partial release or hold, and a credit analyst approves the action. It also reads AR aging owned by Finance and can raise a flag to the fraud watchlist.',
  inputs: [
    ['SAP S/4HANA · FSCM Credit Management', 'Credit limits, exposure, blocked orders', 'o2c', 'r'],
    ['Dun & Bradstreet API', 'Business credit scores and payment index', 'o2c', 'r'],
    ['BigQuery · finance_ar.aging', 'AR aging and days-beyond-terms by customer', 'r2r', 'r'],
    ['BigQuery · risk.fraud_signals', 'Open fraud and sanctions flags', 'id2m', 'r']
  ],
  tools: [
    ['get_credit_exposure', 'Returns limit, open orders, open AR and exposure.', 'SAP S/4HANA · FSCM', 'o2c', 'r', '', 3],
    ['fetch_dnb_score', 'Looks up D&B PAYDEX and failure score.', 'Dun & Bradstreet API', 'o2c', 'r', '', 1],
    ['summarize_payment_history', 'Summarizes 12 months of payment behavior.', 'BigQuery · finance_ar.aging', 'r2r', 'r', '', 2],
    ['check_fraud_flags', 'Checks the customer against open fraud cases.', 'BigQuery · risk.fraud_signals', 'id2m', 'r', '', 1],
    ['release_or_hold_order', 'Releases, partially releases or keeps the credit block.', 'SAP S/4HANA · FSCM', 'o2c', 'w', 'Credit analyst', 1],
    ['raise_watchlist_flag', 'Adds a customer to the fraud watchlist with evidence.', 'ServiceNow IRM', 'id2m', 'w', 'Credit manager', 0.2]
  ],
  outputs: [
    ['SAP S/4HANA · Credit case notes', 'Recommendation memo on the credit case', 'o2c', 'w'],
    ['ServiceNow IRM · Fraud watchlist', 'Watchlist entries with evidence', 'id2m', 'w']
  ],
  users: [
    ['o2c', 'Credit analysts', 9],
    ['r2r', 'AR managers', 4],
    ['id2m', 'Fraud & sanctions analysts', 3]
  ],
  instr: `You are the Credit Risk Agent for Meridian Consumer Brands. You prepare credit decisions for orders that SAP has blocked. A human credit analyst always makes the final call.

For each blocked order:
1. Get exposure with get_credit_exposure.
2. Get the external view with fetch_dnb_score and internal behavior with summarize_payment_history.
3. Always run check_fraud_flags. If there is an open fraud case, recommend HOLD and stop.
4. Recommend RELEASE, PARTIAL_RELEASE (with an amount) or HOLD. Give at most five reasons, each tied to a number you retrieved.
5. Submit the recommendation through release_or_hold_order. It waits for analyst approval.

Only call raise_watchlist_flag when you see two or more independent fraud indicators, and explain each one.
Do not contact the customer. Do not change credit limits.`,
  guard: [
    'Every release or hold waits for a credit analyst (approval gate on release_or_hold_order).',
    'Cannot change credit limits; FSCM scope is order release only.',
    'Watchlist flags need two independent indicators and credit-manager approval.',
    'D&B calls are capped at 150 per day.'
  ],
  use: { rpd: 2150, ms: 0.45, tin: 6800, tout: 900, inv: 4100, pat: 'weekday', trend: 0.04, err: 0.4, p95: 7400 },
  fees: [['Dun & Bradstreet API', 'call', 0.35, 2850]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-credit', 'BigQuery billing export · label agent_id=o2c-credit']
},
{
  id: 'o2c-collections', name: 'Collections Copilot', home: 'o2c', status: 'production',
  arch: 'conversational', auto: 2, health: 'degraded',
  healthNote: 'p95 latency up 2.3× since Nov 16. Gmail API per-user quota is throttling draft_dunning_email for the 6 busiest collectors.',
  owner: 'Rosa Medina', ownerTitle: 'Senior Manager, Collections',
  version: '3.1.2', deployed: '2025-12-02', updated: '2026-11-12',
  platform: 'Gemini Enterprise · Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.3,
  trigger: 'Chat: collectors ask in Gemini Enterprise or from the SAP collections worklist',
  short: 'A chat assistant for AR collectors: summarizes an account, drafts dunning emails, logs promises-to-pay and opens dispute cases.',
  desc: 'Collectors use it all day from Gemini Enterprise. It pulls open items, contacts and recent email threads, drafts the next dunning email (the collector sends it), and records promises-to-pay. When a customer disputes an invoice it opens a case in Customer Care. Account managers in Sales also use it to check a customer’s balance before a call.',
  inputs: [
    ['SAP S/4HANA · FI-AR', 'Open items, due dates, dunning level', 'o2c', 'r'],
    ['Salesforce Sales Cloud', 'Accounts, contacts, account owner', 'l2o', 'r'],
    ['Gmail · Collector mailboxes', 'Recent customer email threads', 'o2c', 'r'],
    ['Salesforce Service Cloud', 'Open dispute cases', 'i2r', 'r']
  ],
  tools: [
    ['get_open_items', 'Lists open invoices with aging buckets.', 'SAP S/4HANA · FI-AR', 'o2c', 'r', '', 4],
    ['summarize_account_history', 'Summarizes the last 90 days of payments, emails and disputes.', 'SAP S/4HANA + Gmail', 'o2c', 'r', '', 3],
    ['draft_dunning_email', 'Creates a Gmail draft in the collector’s mailbox.', 'Gmail API', 'o2c', 'w', 'Collector sends', 2],
    ['log_promise_to_pay', 'Records a promise-to-pay with date and amount.', 'SAP S/4HANA · FSCM Collections', 'o2c', 'w', '', 1],
    ['open_dispute_case', 'Opens a dispute case with the invoice and customer reason.', 'Salesforce Service Cloud', 'i2r', 'w', '', 0.6],
    ['lookup_account_owner', 'Finds the Sales account owner to loop in.', 'Salesforce Sales Cloud', 'l2o', 'r', '', 0.8]
  ],
  outputs: [
    ['Gmail · Draft dunning emails', 'Drafts the collector reviews and sends', 'o2c', 'w'],
    ['SAP S/4HANA · Promises-to-pay', 'Promise-to-pay records', 'o2c', 'w'],
    ['Salesforce Service Cloud · Dispute cases', 'New dispute cases', 'i2r', 'w']
  ],
  users: [
    ['o2c', 'AR collectors', 46],
    ['l2o', 'Key account managers', 14],
    ['i2r', 'Dispute resolution specialists', 6]
  ],
  instr: `You are the Collections Copilot for Meridian Consumer Brands. You help AR collectors work their accounts faster. You never contact customers yourself.

When a collector names a customer:
- Start with get_open_items and summarize_account_history. Lead with total past due, the oldest item and the last customer contact.
- If asked for an email, use draft_dunning_email. Match tone to dunning level: level 1 friendly, level 2 firm, level 3 cites terms and next steps. Never threaten legal action; that is reserved for the Collections Manager.
- If the customer has committed to a payment, confirm the date and amount with the collector, then call log_promise_to_pay.
- If the customer disputes an invoice, call open_dispute_case and tell the collector the case number.

Answer in short paragraphs. Show amounts in the customer's currency. Never reveal one customer's data while discussing another.`,
  guard: [
    'Emails are drafts only; a human sends every message.',
    'No legal-escalation language in drafts (blocked phrase list).',
    'Row-level security: collectors see only customers in their SAP collection segment.',
    'Model Armor screens inbound email content for prompt injection before retrieval.'
  ],
  use: { rpd: 6900, ms: 0.5, tin: 9000, tout: 700, inv: 14200, pat: 'chat', trend: 0.08, err: 1.9, p95: 11800 },
  fees: [],
  telemetry: ['Gemini Enterprise usage reports', 'Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-collections', 'BigQuery billing export · label agent_id=o2c-collections']
},
{
  id: 'o2c-cashapp', name: 'Cash Application Matcher', home: 'o2c', status: 'production',
  arch: 'automation', auto: 3, health: 'healthy',
  owner: 'Kenji Watanabe', ownerTitle: 'Manager, Cash Application',
  version: '2.0.3', deployed: '2026-02-23', updated: '2026-10-30',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Event: bank statement file (BAI2) lands in Cloud Storage, or a remittance email arrives in the AR inbox',
  short: 'Matches incoming bank payments to open invoices using remittance advices, then clears them in SAP. Unmatched cash goes to a worklist.',
  desc: 'Reads lockbox and ACH payments from the daily bank files, extracts remittance details from emails and PDFs with Document AI, and matches payments to open invoices. Confident matches are cleared in SAP automatically, which posts to the general ledger. That posting is a write into Record-to-Report.',
  inputs: [
    ['Kyriba · Bank statements (BAI2)', 'Lockbox and ACH receipts', 'r2r', 'r'],
    ['Gmail · AR remittance inbox', 'Remittance advices (email + PDF)', 'o2c', 'r'],
    ['SAP S/4HANA · FI-AR', 'Open invoices and credit memos', 'o2c', 'r']
  ],
  tools: [
    ['parse_remittance', 'Extracts payer, invoice numbers and amounts from remittances.', 'Document AI · Invoice parser', 'o2c', 'r', '', 3],
    ['match_payment_to_invoices', 'Scores candidate invoice sets for each payment.', 'SAP S/4HANA · FI-AR', 'o2c', 'r', '', 4],
    ['post_cash_clearing', 'Clears matched items and posts the cash receipt to the GL.', 'SAP S/4HANA · FI (GL)', 'r2r', 'w', '', 2],
    ['create_residual_item', 'Books short-pays as residual items for the Deductions team.', 'SAP S/4HANA · FI-AR', 'o2c', 'w', '', 0.7],
    ['flag_unapplied_cash', 'Puts unmatched cash on the cash-app worklist.', 'Pub/Sub · cashapp-worklist', 'o2c', 'w', '', 0.6]
  ],
  outputs: [
    ['SAP S/4HANA · FI clearing documents', 'Cleared AR and GL cash postings', 'r2r', 'w'],
    ['SAP S/4HANA · Residual items', 'Short-pays for deduction review', 'o2c', 'w'],
    ['Cash application worklist', 'Unapplied cash for specialists', 'o2c', 'w']
  ],
  users: [
    ['o2c', 'Cash application specialists', 11],
    ['r2r', 'GL & treasury accountants', 5]
  ],
  instr: `You are the Cash Application Matcher for Meridian Consumer Brands. You apply customer payments to open invoices.

For each payment line in a bank file:
1. Find remittance details with parse_remittance (email body, PDF or EDI 820).
2. Call match_payment_to_invoices. Accept a match only when confidence is at least 0.97 and amounts reconcile to the cent, or the difference is a known deduction code.
3. For accepted matches, call post_cash_clearing. For short-pays with a deduction code, also call create_residual_item.
4. Everything else goes to flag_unapplied_cash with your best three candidate matches.

Never clear an item for a different customer than the payer unless the remittance names a parent-child relationship that exists in SAP.
Never post to GL accounts other than the configured cash clearing accounts.`,
  guard: [
    'Auto-clear only at match confidence ≥ 0.97 with exact amount reconciliation.',
    'GL postings are limited to 4 cash-clearing accounts (allow-list).',
    'Daily auto-clear value cap: $40M; above that the run pauses for treasury.',
    'Cross-customer application requires a parent-child link in SAP.'
  ],
  use: { rpd: 9800, ms: 0.3, tin: 2600, tout: 300, inv: 41800, pat: 'weekday', trend: 0.03, err: 0.5, p95: 3100 },
  fees: [['Document AI · Invoice parser', '1k pages', 30.0, 38.6]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-cashapp', 'BigQuery billing export · label agent_id=o2c-cashapp', 'Document AI processor metrics']
},
{
  id: 'o2c-billing', name: 'Billing Exception Resolver', home: 'o2c', status: 'production',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Aaron Feld', ownerTitle: 'Billing Operations Lead',
  version: '1.3.4', deployed: '2026-06-30', updated: '2026-11-10',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.1,
  trigger: 'Event: billing block or incompletion log entry on a delivery in SAP',
  short: 'Explains why an invoice is blocked (price, quantity, missing proof of delivery) and proposes the fix for a billing analyst to approve.',
  desc: 'Blocked billing delays cash. The agent compares the order price with the trade agreement, pulls proof of delivery from the carrier portal, and drafts the correction. A billing analyst approves it. Pricing problems are sent to the Quote-to-Cash pricing team so they get fixed at the source.',
  inputs: [
    ['SAP S/4HANA · Billing documents', 'Blocked deliveries and incompletion logs', 'o2c', 'r'],
    ['SAP S/4HANA · Pricing conditions', 'Agreed prices and discounts', 'q2c', 'r'],
    ['SAP TPM · Trade agreements', 'Promotion terms behind off-invoice discounts', 'l2o', 'r'],
    ['project44', 'Proof of delivery and delivered quantities', 'i2d', 'r']
  ],
  tools: [
    ['explain_billing_block', 'Reads the block reason and incompletion log.', 'SAP S/4HANA · SD Billing', 'o2c', 'r', '', 3],
    ['compare_price_to_agreement', 'Compares invoiced price with conditions and promotions.', 'SAP S/4HANA · Pricing + TPM', 'q2c', 'r', '', 2],
    ['fetch_proof_of_delivery', 'Retrieves signed POD and delivered quantity.', 'project44', 'i2d', 'r', '', 2],
    ['propose_billing_correction', 'Drafts the corrected billing document.', 'SAP S/4HANA · SD Billing', 'o2c', 'w', 'Billing analyst', 1],
    ['notify_pricing_owner', 'Posts a pricing discrepancy to the pricing team space.', 'Google Chat · #pricing-discrepancies', 'q2c', 'w', '', 0.5]
  ],
  outputs: [
    ['SAP S/4HANA · Billing corrections', 'Approved corrected invoices', 'o2c', 'w'],
    ['Google Chat · #pricing-discrepancies', 'Root-cause notes for pricing', 'q2c', 'w']
  ],
  users: [
    ['o2c', 'Billing analysts', 17],
    ['q2c', 'Pricing analysts', 6]
  ],
  instr: `You are the Billing Exception Resolver for Meridian Consumer Brands. You clear billing blocks so invoices go out on time.

For each blocked delivery:
1. Call explain_billing_block and classify the cause as PRICE, QUANTITY, POD_MISSING, MASTER_DATA or OTHER.
2. PRICE: call compare_price_to_agreement. Identify which side is wrong, the order or the agreement.
3. QUANTITY or POD_MISSING: call fetch_proof_of_delivery and bill the delivered quantity.
4. Draft the fix with propose_billing_correction. A billing analyst approves it.
5. If the agreement itself is wrong, call notify_pricing_owner with the agreement ID and the evidence.

Do not release a block for MASTER_DATA causes; describe what needs to change and who owns it.`,
  guard: [
    'Every billing correction waits for a billing analyst.',
    'Corrections above $50,000 also need the Billing Operations Lead.',
    'No changes to pricing conditions; the agent can only notify Pricing.'
  ],
  use: { rpd: 3300, ms: 0.45, tin: 7200, tout: 850, inv: 6400, pat: 'weekday', trend: 0.05, err: 0.7, p95: 8900 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-billing', 'BigQuery billing export · label agent_id=o2c-billing']
},
{
  id: 'o2c-deductions', name: 'Deductions Analyst', home: 'o2c', status: 'production',
  arch: 'analytical', auto: 1, health: 'healthy',
  owner: 'Tanya Holloway', ownerTitle: 'Manager, Deductions & Disputes',
  version: '1.9.0', deployed: '2026-04-14', updated: '2026-11-06',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.2,
  trigger: 'Schedule: daily 05:30 ET batch over new retailer deductions, plus on-demand questions',
  short: 'Classifies retailer short-pays (promotions, shortages, compliance fines) and estimates which are valid, so analysts dispute the right ones.',
  desc: 'Retailers deduct money from payments for promotions, shortages and compliance fines. The agent reads the deduction codes, matches each one to the promotion, shipment or contract term behind it, and scores whether it is valid. It writes recommendations only. It also publishes a weekly trade-spend leakage view for Revenue Management.',
  inputs: [
    ['Retailer remittances (EDI 812/820)', 'Deduction codes and amounts', 'o2c', 'r'],
    ['SAP TPM · Promotion plans', 'Planned promotions and accrued trade spend', 'l2o', 'r'],
    ['project44 · Proof of delivery', 'Delivered vs. invoiced quantities', 'i2d', 'r'],
    ['Icertis CLM · Customer contracts', 'Compliance and fine schedules', 'c2c', 'r']
  ],
  tools: [
    ['classify_deduction', 'Maps a retailer code to Meridian’s deduction taxonomy.', 'Vertex AI Search · deduction code library', 'o2c', 'r', '', 3],
    ['match_to_promotion', 'Finds the promotion and accrual that a deduction relates to.', 'SAP TPM', 'l2o', 'r', '', 2],
    ['check_delivery_evidence', 'Checks shortage claims against POD.', 'project44', 'i2d', 'r', '', 1.5],
    ['retrieve_contract_terms', 'Pulls the compliance and fine schedule for the retailer.', 'Icertis CLM', 'c2c', 'r', '', 1],
    ['write_recommendation', 'Stores validity score and suggested action.', 'BigQuery · o2c_deductions.recommendations', 'o2c', 'w', '', 1]
  ],
  outputs: [
    ['BigQuery · o2c_deductions.recommendations', 'Validity scores and suggested actions', 'o2c', 'w'],
    ['Looker · Trade spend leakage', 'Weekly leakage view for Revenue Management', 'l2o', 'w']
  ],
  users: [
    ['o2c', 'Deduction analysts', 21],
    ['l2o', 'Revenue managers', 8],
    ['s2e', 'FP&A analysts', 3]
  ],
  instr: `You are the Deductions Analyst for Meridian Consumer Brands. You analyze retailer deductions and recommend whether each is valid. You never dispute or write off anything yourself.

For each new deduction:
1. classify_deduction into PROMOTION, SHORTAGE, PRICING, COMPLIANCE_FINE, RETURN or UNKNOWN.
2. PROMOTION: match_to_promotion and compare the amount with the accrual.
3. SHORTAGE: check_delivery_evidence.
4. COMPLIANCE_FINE: retrieve_contract_terms and check the fine schedule.
5. Score validity from 0 to 1 and recommend ACCEPT, DISPUTE or INVESTIGATE, citing the evidence.
6. Save it with write_recommendation.

When answering analysts, show amounts by retailer and code, and say what share of the evidence was found automatically.`,
  guard: [
    'Advise-only: no write access to SAP AR or the retailer portals.',
    'Recommendations without evidence are labeled INVESTIGATE, never DISPUTE.',
    'Retailer portal credentials are never exposed to the model.'
  ],
  use: { rpd: 1450, ms: 0.55, tin: 14000, tout: 1800, inv: 1900, pat: 'weekday', trend: 0.02, err: 0.3, p95: 16500 },
  fees: [['Vertex AI Search queries', '1k queries', 4.0, 9.6]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-o2c-deductions', 'BigQuery billing export · label agent_id=o2c-deductions']
},
{
  id: 'o2c-pulse', name: 'O2C Daily Pulse', home: 'o2c', status: 'production',
  arch: 'monitoring', auto: 1, health: 'healthy',
  owner: 'Priya Raman', ownerTitle: 'VP Customer Operations',
  version: '1.2.0', deployed: '2026-07-21', updated: '2026-10-15',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.2,
  trigger: 'Schedule: weekdays 06:00 ET, plus hourly anomaly checks',
  short: 'Posts a morning digest of order backlog, credit holds, billing blocks and DSO, and raises an IT incident when an O2C data feed breaks.',
  desc: 'Runs fixed KPI queries over the O2C data mart, spots anomalies and posts a short digest to the leadership space. When a feed is late or broken it opens a ServiceNow incident with IT, which is its one write outside Order-to-Cash.',
  inputs: [
    ['BigQuery · o2c_mart', 'Orders, holds, billing blocks, AR', 'o2c', 'r'],
    ['BigQuery · logistics.shipment_backlog', 'Unshipped orders by DC', 'i2d', 'r']
  ],
  tools: [
    ['run_kpi_queries', 'Runs the 14 certified O2C KPI queries.', 'BigQuery · o2c_mart', 'o2c', 'r', '', 5],
    ['detect_anomalies', 'Compares KPIs with the trailing 8-week band.', 'BigQuery ML', 'o2c', 'r', '', 2],
    ['post_digest', 'Posts the digest to the leadership space.', 'Google Chat · O2C Leadership', 'o2c', 'w', '', 1],
    ['open_data_incident', 'Opens an incident when a source feed is late or broken.', 'ServiceNow ITSM', 'r2d', 'w', '', 0.1]
  ],
  outputs: [
    ['Google Chat · O2C Leadership', 'Morning digest and anomaly alerts', 'o2c', 'w'],
    ['ServiceNow ITSM · Incidents', 'Data feed incidents', 'r2d', 'w']
  ],
  users: [
    ['o2c', 'O2C leaders and supervisors', 24],
    ['s2e', 'FP&A partners', 5]
  ],
  instr: `You are O2C Daily Pulse for Meridian Consumer Brands. Every weekday at 06:00 ET you brief O2C leadership.

1. Run run_kpi_queries. Use only the certified queries; never write your own SQL.
2. Run detect_anomalies. Report only metrics outside their 8-week band.
3. Post one digest with post_digest: five bullets at most, biggest dollar impact first, each with the number and the change.
4. If any source table is more than 3 hours stale, call open_data_incident with the table name and last load time instead of reporting its metrics.`,
  guard: ['Read-only on business data; only certified queries.', 'One incident per table per day (dedupe).'],
  use: { rpd: 420, ms: 0.3, tin: 5200, tout: 600, inv: 610, pat: 'daily', trend: 0.0, err: 0.2, p95: 4200 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Scheduler job history', 'BigQuery billing export · label agent_id=o2c-pulse']
},
{
  id: 'o2c-returns', name: 'Returns Credit Memo Agent', home: 'o2c', status: 'review',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Aaron Feld', ownerTitle: 'Billing Operations Lead',
  version: '0.9.0', deployed: '', updated: '2026-11-14',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-stg', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.1,
  trigger: 'Event: return received at DC (goods receipt against RMA)',
  short: 'Creates credit memos for approved returns once goods are received at the DC. In review with Controllership.',
  desc: 'Planned to close the loop on returns: once the DC receives the goods, the agent creates the credit memo. Controllership is reviewing the GL impact before production.',
  inputs: [['SAP S/4HANA · RMA', 'Approved returns', 'i2r', 'r'], ['Manhattan WMS', 'Return goods receipts', 'i2d', 'r']],
  tools: [['create_credit_memo', 'Creates the credit memo for received returns.', 'SAP S/4HANA · SD Billing', 'o2c', 'w', 'Billing analyst', 1]],
  outputs: [['SAP S/4HANA · Credit memos', 'Credit memos for returns', 'o2c', 'w'], ['SAP S/4HANA · FI (GL)', 'Revenue reversal postings', 'r2r', 'w']],
  users: [['o2c', 'Billing analysts (pilot)', 4]],
  use: { rpd: 0, ms: 0.4, tin: 3000, tout: 300, inv: 0, pat: 'weekday', trend: 0, err: 0, p95: 0 },
  fees: [], telemetry: ['Staging only']
},
{
  id: 'o2c-portal', name: 'B2B Order Portal Assistant', home: 'o2c', status: 'draft',
  arch: 'conversational', auto: 1, health: 'healthy',
  owner: 'Dana Whitfield', ownerTitle: 'Director, Order Management',
  version: '0.2.0', deployed: '', updated: '2026-11-17',
  platform: 'Gemini Enterprise · Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-o2c-agents-dev', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.3,
  trigger: 'Chat: retailer buyers on the B2B portal',
  short: 'First draft of an assistant that lets retailer buyers check order status and invoices on the B2B portal.',
  desc: 'Early draft. External-facing, so it will need a separate security review.',
  inputs: [['SAP S/4HANA · SD', 'Orders for the buyer’s account', 'o2c', 'r'], ['SAP S/4HANA · FI-AR', 'Invoices for the buyer’s account', 'o2c', 'r']],
  tools: [['lookup_orders', 'Order status for the signed-in buyer.', 'SAP S/4HANA · SD', 'o2c', 'r', '', 1]],
  outputs: [['B2B portal chat', 'Answers to retailer buyers', 'o2c', 'w']],
  users: [['o2c', 'Order management (testers)', 3]],
  use: { rpd: 0, ms: 0.5, tin: 4000, tout: 400, inv: 0, pat: 'chat', trend: 0, err: 0, p95: 0 },
  fees: [], telemetry: ['Dev only']
},

/* =============================== RECORD-TO-REPORT =============================== */
{
  id: 'r2r-recon', name: 'Account Reconciliation Agent', home: 'r2r', status: 'production',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Leah Abernathy', ownerTitle: 'Assistant Controller, GL',
  version: '2.2.0', deployed: '2026-01-26', updated: '2026-10-29',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.0,
  trigger: 'Schedule: daily 02:00 ET, and every 4 hours from close WD-1 to WD+3',
  short: 'Prepares balance-sheet reconciliations: ties GL to subledgers and bank, proposes reconciling items, and submits them to BlackLine for a preparer to certify.',
  desc: 'Covers 1,140 balance-sheet accounts. For each one it pulls the GL balance and the supporting balance (AR and AP subledgers, bank, inventory), matches transactions and proposes reconciling items with evidence. A preparer certifies each reconciliation in BlackLine. It reads the AR and AP subledgers that Order-to-Cash and Procure-to-Pay own.',
  inputs: [
    ['SAP S/4HANA · General ledger', 'Account balances and line items', 'r2r', 'r'],
    ['BlackLine · Reconciliations', 'Prior-period recs and open items', 'r2r', 'r'],
    ['Kyriba · Bank statements', 'Bank balances and transactions', 'r2r', 'r'],
    ['SAP S/4HANA · FI-AR subledger', 'Customer open items', 'o2c', 'r'],
    ['SAP S/4HANA · FI-AP subledger', 'Vendor open items', 'p2p', 'r']
  ],
  tools: [
    ['fetch_gl_balance', 'Gets period-end GL balance and line items.', 'SAP S/4HANA · GL', 'r2r', 'r', '', 4],
    ['fetch_subledger_balance', 'Gets AR or AP subledger balance for the same account.', 'SAP S/4HANA · FI-AR / FI-AP', 'o2c', 'r', '', 2],
    ['fetch_bank_balance', 'Gets bank statement balance and transactions.', 'Kyriba', 'r2r', 'r', '', 1.5],
    ['match_transactions', 'Matches GL lines to support lines.', 'BigQuery · finance_recon', 'r2r', 'r', '', 3],
    ['propose_reconciling_items', 'Drafts reconciling items with evidence links.', 'BlackLine', 'r2r', 'w', '', 1.5],
    ['submit_reconciliation', 'Submits the reconciliation for certification.', 'BlackLine', 'r2r', 'w', 'Preparer certifies', 1]
  ],
  outputs: [
    ['BlackLine · Reconciliations', 'Prepared reconciliations awaiting certification', 'r2r', 'w']
  ],
  users: [
    ['r2r', 'GL accountants', 34],
    ['o2c', 'AR leads (subledger questions)', 4],
    ['p2p', 'AP leads (subledger questions)', 4]
  ],
  instr: `You are the Account Reconciliation Agent for Meridian Consumer Brands. You prepare balance-sheet reconciliations. Humans certify them.

For each account on today's schedule:
1. fetch_gl_balance for the period.
2. Get support: fetch_subledger_balance for AR and AP control accounts, fetch_bank_balance for cash accounts, or the support source configured for the account.
3. match_transactions. Explain every unmatched item above the account's threshold.
4. propose_reconciling_items with evidence links. Never plug a difference.
5. submit_reconciliation when the unexplained variance is below threshold. Otherwise submit it marked NEEDS_REVIEW with your best explanation.

Never post journal entries. If a correcting entry is needed, describe it in the reconciliation notes.`,
  guard: [
    'No journal-entry access; BlackLine scope is prepare and submit only.',
    'Every reconciliation is certified by a human preparer (SOX key control RC-04).',
    'Unexplained variance above threshold is always marked NEEDS_REVIEW.',
    'Subledger access is read-only and limited to control accounts.'
  ],
  use: { rpd: 7200, ms: 0.35, tin: 8200, tout: 900, inv: 12600, pat: 'close', trend: 0.0, err: 0.5, p95: 9400 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-r2r-recon', 'BigQuery billing export · label agent_id=r2r-recon', 'BlackLine API audit log']
},
{
  id: 'r2r-je-review', name: 'Journal Entry Risk Reviewer', home: 'r2r', status: 'production',
  arch: 'monitoring', auto: 1, health: 'healthy',
  owner: 'Nathaniel Brooks', ownerTitle: 'Corporate Controller',
  version: '1.4.1', deployed: '2026-03-30', updated: '2026-10-08',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.0,
  trigger: 'Event: every manual journal entry posted in SAP',
  short: 'Scores every manual journal entry for risk (unusual accounts, round amounts, after-hours, SoD conflicts) and sends high-risk entries to Internal Audit.',
  desc: 'Reviews 100% of manual journal entries instead of a sample. It checks the preparer’s access against segregation-of-duties rules and raises high-risk entries in AuditBoard for Internal Audit, which is a write into Identify-to-Mitigate.',
  inputs: [
    ['SAP S/4HANA · Journal entries', 'Manual JEs with preparer and approver', 'r2r', 'r'],
    ['SAP GRC · Access control', 'Roles and SoD rule set', 'id2m', 'r']
  ],
  tools: [
    ['score_journal_entry', 'Scores a JE on 22 risk indicators.', 'BigQuery ML · je_risk_model', 'r2r', 'r', '', 3],
    ['check_sod_conflict', 'Checks preparer/approver roles against SoD rules.', 'SAP GRC', 'id2m', 'r', '', 1],
    ['attach_review_note', 'Adds the risk rationale to the JE in BlackLine Journals.', 'BlackLine · Journals', 'r2r', 'w', '', 1],
    ['raise_audit_flag', 'Creates an issue for Internal Audit with evidence.', 'AuditBoard', 'id2m', 'w', '', 0.15]
  ],
  outputs: [
    ['BlackLine · Journals review notes', 'Risk rationale on each entry', 'r2r', 'w'],
    ['AuditBoard · Issues', 'High-risk entries for Internal Audit', 'id2m', 'w']
  ],
  users: [
    ['r2r', 'Controllers and reviewers', 12],
    ['id2m', 'Internal audit', 7]
  ],
  instr: `You are the Journal Entry Risk Reviewer for Meridian Consumer Brands. You review every manual journal entry. You never approve, reverse or change an entry.

For each entry:
1. score_journal_entry.
2. check_sod_conflict for the preparer and approver.
3. attach_review_note with the score and the top three indicators in plain words.
4. If the score is 0.8 or higher, or there is any SoD conflict, call raise_audit_flag.

Be factual. Do not speculate about intent.`,
  guard: ['Read-only on the GL.', 'Wording rules: no accusations or intent language.', 'Audit flags are deduplicated per entry.'],
  use: { rpd: 3900, ms: 0.4, tin: 4100, tout: 420, inv: 21800, pat: 'close', trend: 0.0, err: 0.3, p95: 5200 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-r2r-je-review', 'BigQuery billing export · label agent_id=r2r-je-review']
},
{
  id: 'r2r-close', name: 'Close Copilot', home: 'r2r', status: 'production',
  arch: 'conversational', auto: 1, health: 'healthy',
  owner: 'Leah Abernathy', ownerTitle: 'Assistant Controller, GL',
  version: '2.0.0', deployed: '2026-02-02', updated: '2026-11-03',
  platform: 'Gemini Enterprise · Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.3,
  trigger: 'Chat: Gemini Enterprise and the #month-end-close space',
  short: 'Answers “what’s blocking close?” from the BlackLine task list, finds accounting policies, and drafts status updates for the Controller.',
  desc: 'The close team’s chat assistant. It tracks the close checklist, lists blockers by owner and day, answers policy questions from the accounting manual, and drafts the daily close update. FP&A uses it during close to know when numbers are final.',
  inputs: [
    ['BlackLine · Close task list', 'Tasks, owners, due day, status', 'r2r', 'r'],
    ['SAP S/4HANA · Period status', 'Open and closed posting periods', 'r2r', 'r'],
    ['Google Drive · Accounting policy manual', 'Policies and close procedures', 'r2r', 'r']
  ],
  tools: [
    ['get_close_status', 'Summarizes progress by workday and team.', 'BlackLine', 'r2r', 'r', '', 3],
    ['list_blockers', 'Lists late or blocked tasks with owners.', 'BlackLine', 'r2r', 'r', '', 2],
    ['find_policy', 'Searches the accounting policy manual.', 'Vertex AI Search · policy corpus', 'r2r', 'r', '', 2],
    ['draft_status_update', 'Drafts the daily close update for the Controller.', 'Google Chat · #month-end-close', 'r2r', 'w', 'Controller posts', 0.5]
  ],
  outputs: [['Google Chat · #month-end-close', 'Draft daily close updates', 'r2r', 'w']],
  users: [
    ['r2r', 'Close team accountants', 58],
    ['s2e', 'FP&A analysts', 6]
  ],
  instr: `You are Close Copilot for Meridian Consumer Brands. You help the close team see where the month-end close stands.

- For status questions, use get_close_status and answer by workday (WD-1 to WD+5).
- For "what's blocking", use list_blockers and group by owner; show how many days late each item is.
- For policy questions, use find_policy and quote the policy section number. If the manual does not cover it, say so and suggest asking Technical Accounting.
- Draft the daily update with draft_status_update only when the Controller asks.

Never give an opinion on accounting treatment beyond what the policy manual says.`,
  guard: ['Read-only on BlackLine and SAP.', 'Policy answers must cite a section number.', 'Status updates are drafts the Controller posts.'],
  use: { rpd: 2600, ms: 0.55, tin: 7600, tout: 650, inv: 5900, pat: 'close', trend: 0.05, err: 0.6, p95: 8800 },
  fees: [['Vertex AI Search queries', '1k queries', 4.0, 8.6]],
  telemetry: ['Gemini Enterprise usage reports', 'Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=r2r-close']
},
{
  id: 'r2r-flux', name: 'Flux Commentary Agent', home: 'r2r', status: 'production',
  arch: 'analytical', auto: 2, health: 'healthy',
  owner: 'Ivan Petrov', ownerTitle: 'Director, Financial Reporting',
  version: '1.6.2', deployed: '2026-04-27', updated: '2026-11-05',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.2,
  trigger: 'Schedule: close WD+2 after trial balance lock; on demand afterwards',
  short: 'Explains month-over-month and budget variances with operational drivers (volume, trade spend, headcount) and drafts commentary for the FP&A pack.',
  desc: 'After the trial balance locks, it computes variances above threshold, pulls operational drivers from other processes (shipments, trade spend, headcount) and drafts plain-English commentary. Controllers approve it before it goes into the FP&A monthly pack owned by Strategy-to-Execution.',
  inputs: [
    ['BigQuery · finance_mart.trial_balance', 'Actuals, prior month, budget', 'r2r', 'r'],
    ['BigQuery · logistics.shipments', 'Shipped cases by brand and channel', 'i2d', 'r'],
    ['SAP TPM · Trade spend', 'Trade spend accruals by customer', 'l2o', 'r'],
    ['Workday · Headcount', 'Headcount and payroll by cost center', 'h2r', 'r']
  ],
  tools: [
    ['compute_variances', 'Computes variances above materiality thresholds.', 'BigQuery · finance_mart', 'r2r', 'r', '', 2],
    ['retrieve_drivers', 'Pulls volume, trade spend and headcount drivers.', 'BigQuery · cross-domain views', 'i2d', 'r', '', 3],
    ['draft_commentary', 'Writes commentary per line with driver attribution.', 'Internal', 'r2r', 'r', '', 1],
    ['publish_to_reporting_pack', 'Inserts approved commentary into the FP&A pack.', 'Google Sheets · FP&A monthly pack', 's2e', 'w', 'Controller', 0.4]
  ],
  outputs: [['Google Sheets · FP&A monthly pack', 'Approved variance commentary', 's2e', 'w']],
  users: [
    ['r2r', 'Financial reporting analysts', 19],
    ['s2e', 'FP&A analysts', 11]
  ],
  instr: `You are the Flux Commentary Agent for Meridian Consumer Brands. You explain financial variances in plain English.

1. compute_variances for the closed period against prior month and budget. Cover only lines above the materiality threshold.
2. retrieve_drivers for each line: shipped volume for revenue and COGS, trade spend for net sales, headcount for SG&A.
3. draft_commentary: one or two sentences per line. Lead with the dollar change, then the driver with its number. Example: "Net sales up $4.2M (+3.1%) on 6% higher shipped cases in Club, partly offset by $1.1M more trade spend at two national accounts."
4. When the Controller approves, publish_to_reporting_pack.

If the drivers explain less than 70% of a variance, say so and list what is unexplained.`,
  guard: ['Commentary is published only after Controller approval.', 'Unexplained share above 30% is stated explicitly.', 'No access to forecast or guidance data.'],
  use: { rpd: 980, ms: 0.6, tin: 18000, tout: 2200, inv: 640, pat: 'close', trend: 0.0, err: 0.4, p95: 21000 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-r2r-flux', 'BigQuery billing export · label agent_id=r2r-flux']
},
{
  id: 'r2r-interco', name: 'Intercompany Matching Agent', home: 'r2r', status: 'production',
  arch: 'automation', auto: 3, health: 'healthy',
  owner: 'Leah Abernathy', ownerTitle: 'Assistant Controller, GL',
  version: '1.1.0', deployed: '2026-06-08', updated: '2026-09-22',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Schedule: daily, and hourly during close WD-1 to WD+2',
  short: 'Matches intercompany receivables and payables across Meridian’s 14 legal entities and proposes eliminations within tolerance.',
  desc: 'Stays inside Record-to-Report. Matches both sides of intercompany transactions, auto-confirms matches within $500 and FX tolerance, and sends the rest to the intercompany accountants.',
  inputs: [['SAP S/4HANA · Intercompany', 'IC receivables and payables by entity', 'r2r', 'r'], ['SAP S/4HANA · FX rates', 'Period-end rates', 'r2r', 'r']],
  tools: [
    ['fetch_ic_balances', 'Gets both sides by entity pair.', 'SAP S/4HANA · ICR', 'r2r', 'r', '', 3],
    ['match_ic_pairs', 'Matches documents within tolerance.', 'BigQuery · finance_ic', 'r2r', 'r', '', 3],
    ['confirm_match', 'Confirms matches within tolerance.', 'SAP S/4HANA · ICR', 'r2r', 'w', '', 1]
  ],
  outputs: [['SAP S/4HANA · ICR matches', 'Confirmed intercompany matches', 'r2r', 'w']],
  users: [['r2r', 'Intercompany accountants', 8]],
  instr: `You are the Intercompany Matching Agent for Meridian Consumer Brands. Match intercompany receivables and payables for each entity pair. Confirm a match only when the difference is within $500 after FX. Send everything else to the intercompany queue with the likely cause (timing, FX, missing invoice or wrong entity).`,
  guard: ['Auto-confirm only within $500 and FX tolerance.', 'No journal entries.'],
  use: { rpd: 2100, ms: 0.25, tin: 2400, tout: 250, inv: 3300, pat: 'close', trend: 0.0, err: 0.2, p95: 2600 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=r2r-interco']
},
{
  id: 'r2r-rev-accrual', name: 'Revenue Accrual Agent', home: 'r2r', status: 'production',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Grace Lin', ownerTitle: 'Revenue Controller',
  version: '1.5.0', deployed: '2026-05-04', updated: '2026-11-01',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.0,
  trigger: 'Schedule: close WD-1 and WD+1',
  short: 'Calculates unbilled revenue and variable-consideration accruals from shipments, billing and contract terms, and proposes the journal entry.',
  desc: 'At each close it finds goods delivered but not yet billed, estimates variable consideration (rebates, returns) from contract terms, and drafts the accrual journal entry for the Revenue Controller. It depends on three other processes: billing data from Order-to-Cash, proof of delivery from Inventory-to-Deliver and contract terms from Contract-to-Compliance.',
  inputs: [
    ['SAP S/4HANA · Billing documents', 'Billed and unbilled deliveries', 'o2c', 'r'],
    ['BigQuery · finance_revenue.booked_orders', 'Booked orders from Order Intake Agent', 'r2r', 'r'],
    ['project44 · Proof of delivery', 'Delivery date and quantity', 'i2d', 'r'],
    ['Icertis CLM · Contract terms', 'Rebates, return rights, price protection', 'c2c', 'r']
  ],
  tools: [
    ['compute_unbilled_revenue', 'Finds delivered-not-billed by customer.', 'BigQuery · finance_revenue', 'r2r', 'r', '', 2],
    ['get_billing_status', 'Checks billing status of deliveries.', 'SAP S/4HANA · SD Billing', 'o2c', 'r', '', 2],
    ['get_delivery_evidence', 'Confirms transfer of control date.', 'project44', 'i2d', 'r', '', 1.5],
    ['estimate_variable_consideration', 'Estimates rebate and return reserves from contract terms.', 'Icertis CLM', 'c2c', 'r', '', 1],
    ['post_accrual_journal', 'Parks the accrual JE for approval.', 'SAP S/4HANA · GL', 'r2r', 'w', 'Revenue controller', 0.2]
  ],
  outputs: [['SAP S/4HANA · Parked journal entries', 'Revenue accrual JEs awaiting approval', 'r2r', 'w']],
  users: [
    ['r2r', 'Revenue accountants', 9],
    ['o2c', 'Billing analysts (cut-off questions)', 3]
  ],
  instr: `You are the Revenue Accrual Agent for Meridian Consumer Brands. You prepare period-end revenue accruals under ASC 606. The Revenue Controller approves every entry.

1. compute_unbilled_revenue for the period, then confirm with get_billing_status.
2. For each unbilled delivery, get_delivery_evidence to confirm control transferred in the period.
3. estimate_variable_consideration from contract terms for rebates and returns.
4. Park one JE per legal entity with post_accrual_journal. Attach the calculation and evidence.

If delivery evidence is missing for more than 2% of unbilled value, stop and report it instead of accruing.`,
  guard: ['JEs are parked, never posted; Revenue Controller approves.', 'Evidence-gap rule: more than 2% missing stops the run.', 'SOX key control REV-07.'],
  use: { rpd: 1250, ms: 0.45, tin: 12000, tout: 1400, inv: 420, pat: 'close', trend: 0.0, err: 0.3, p95: 14000 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=r2r-rev-accrual']
},
{
  id: 'r2r-tax', name: 'Indirect Tax Checker', home: 'r2r', status: 'production',
  arch: 'monitoring', auto: 1, health: 'incident',
  healthNote: 'Runs paused since Nov 18, 04:10 ET. The Avalara connector service account key was rotated and the agent is failing authentication. ServiceNow INC0048213 is open with IT.',
  owner: 'Omar Haddad', ownerTitle: 'Tax Director',
  version: '1.0.4', deployed: '2026-08-17', updated: '2026-11-18',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Schedule: nightly over the day’s invoices',
  short: 'Checks sales tax on yesterday’s invoices against Avalara and flags exposure before the filing cycle.',
  desc: 'Compares tax charged on invoices with what Avalara calculates for the ship-to jurisdiction and exemption status. It reads billing data from Order-to-Cash and flags exceptions to the tax team.',
  inputs: [['SAP S/4HANA · Billing documents', 'Invoiced tax by line', 'o2c', 'r'], ['Avalara AvaTax', 'Expected tax and exemption certificates', 'r2r', 'r']],
  tools: [
    ['get_invoice_tax_lines', 'Reads tax lines from invoices.', 'SAP S/4HANA · SD Billing', 'o2c', 'r', '', 2],
    ['recalculate_tax', 'Recalculates expected tax.', 'Avalara AvaTax', 'r2r', 'r', '', 2],
    ['log_tax_exception', 'Logs exceptions for the tax team.', 'BigQuery · tax.exceptions', 'r2r', 'w', '', 0.5]
  ],
  outputs: [['BigQuery · tax.exceptions', 'Tax exceptions for review', 'r2r', 'w']],
  users: [['r2r', 'Tax analysts', 6], ['c2c', 'Legal (exemption certificates)', 2]],
  instr: `You are the Indirect Tax Checker for Meridian Consumer Brands. Each night, compare tax charged on yesterday's invoices with Avalara's calculation. Log any line where the difference is above $1 or the exemption status disagrees. Never change invoices or tax codes.`,
  guard: ['Read-only on billing.', 'Exceptions only; no changes to tax codes.'],
  use: { rpd: 640, ms: 0.2, tin: 2200, tout: 200, inv: 29, pat: 'daily', trend: -0.05, err: 6.8, p95: 3400 },
  fees: [['Avalara AvaTax calls', '1k calls', 1.2, 15.4]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'Cloud Logging · reasoning_engine/mrd-r2r-tax', 'BigQuery billing export · label agent_id=r2r-tax']
},
{
  id: 'r2r-ext-report', name: 'External Reporting Drafter', home: 'r2r', status: 'review',
  arch: 'analytical', auto: 2, health: 'healthy',
  owner: 'Ivan Petrov', ownerTitle: 'Director, Financial Reporting',
  version: '0.8.0', deployed: '', updated: '2026-11-13',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-stg', region: 'us-east4',
  model: 'gemini-3-pro', temp: 0.2,
  trigger: 'On demand during the 10-Q / 10-K cycle',
  short: 'Drafts MD&A sections and footnote roll-forwards for the 10-Q. In review with the Disclosure Committee.',
  desc: 'Drafts results-of-operations text and footnote roll-forwards in Workiva from the closed financials and flux commentary. Needs Disclosure Committee sign-off before production.',
  inputs: [['BigQuery · finance_mart', 'Closed financials', 'r2r', 'r'], ['Google Sheets · FP&A monthly pack', 'Approved commentary', 's2e', 'r']],
  tools: [['draft_mdna_section', 'Drafts an MD&A section in Workiva.', 'Workiva', 's2v', 'w', 'Disclosure Committee', 1]],
  outputs: [['Workiva · 10-Q draft', 'Draft MD&A and footnotes', 's2v', 'w']],
  users: [['r2r', 'SEC reporting team (pilot)', 5]],
  use: { rpd: 0, ms: 0.6, tin: 20000, tout: 3000, inv: 0, pat: 'weekday', trend: 0, err: 0, p95: 0 },
  fees: [], telemetry: ['Staging only']
},
{
  id: 'r2r-lease', name: 'Lease Accounting Assistant', home: 'r2r', status: 'draft',
  arch: 'conversational', auto: 1, health: 'healthy',
  owner: 'Grace Lin', ownerTitle: 'Revenue Controller',
  version: '0.1.0', deployed: '', updated: '2026-11-11',
  platform: 'Gemini Enterprise · Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-r2r-agents-dev', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.3,
  trigger: 'Chat',
  short: 'First draft: answers ASC 842 questions on Meridian’s 310 warehouse and equipment leases.',
  desc: 'Early draft reading the lease subledger and lease contracts.',
  inputs: [['CoStar Lease Accounting', 'Lease schedules', 'a2r', 'r'], ['Icertis CLM', 'Lease contracts', 'c2c', 'r']],
  tools: [['get_lease_schedule', 'Lease amortization schedule.', 'CoStar', 'a2r', 'r', '', 1]],
  outputs: [['Chat answers', 'Lease Q&A', 'r2r', 'w']],
  users: [['r2r', 'Lease accountants (testers)', 2]],
  use: { rpd: 0, ms: 0.5, tin: 5000, tout: 500, inv: 0, pat: 'chat', trend: 0, err: 0, p95: 0 },
  fees: [], telemetry: ['Dev only']
},

/* ============= Agents homed elsewhere that reach into O2C or R2R (full detail) ============= */
{
  id: 'i2r-wismo', name: 'Where’s My Order Assistant', home: 'i2r', status: 'production',
  arch: 'conversational', auto: 1, health: 'healthy',
  owner: 'Hannah Lindqvist', ownerTitle: 'Director, Customer Care',
  version: '3.4.0', deployed: '2025-10-06', updated: '2026-11-08',
  platform: 'Gemini Enterprise · Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-i2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.2,
  trigger: 'Chat: Salesforce Service Cloud console and Gemini Enterprise',
  short: 'Gives customer care reps a one-line answer to “where is my order?” by joining SAP order status with live carrier tracking.',
  desc: 'Its primary users are customer care reps, so it is homed in Issue-to-Resolution. It reads orders owned by Order-to-Cash and tracking owned by Inventory-to-Deliver. Order management and account managers use it too, which is why it appears in their cross-process sections.',
  inputs: [
    ['SAP S/4HANA · Sales orders', 'Order, delivery and billing status', 'o2c', 'r'],
    ['project44', 'Live shipment tracking and ETA', 'i2d', 'r'],
    ['Salesforce Service Cloud', 'Customer cases and history', 'i2r', 'r']
  ],
  tools: [
    ['lookup_order_status', 'Order, delivery and invoice status by PO or order number.', 'SAP S/4HANA · SD', 'o2c', 'r', '', 4],
    ['get_shipment_eta', 'Carrier, last scan and predicted ETA.', 'project44', 'i2d', 'r', '', 3],
    ['summarize_case', 'Summarizes the customer’s open case.', 'Salesforce Service Cloud', 'i2r', 'r', '', 1.5],
    ['add_case_note', 'Adds the answer to the case.', 'Salesforce Service Cloud', 'i2r', 'w', '', 1]
  ],
  outputs: [['Salesforce Service Cloud · Case notes', 'Order status notes on cases', 'i2r', 'w']],
  users: [
    ['i2r', 'Customer care reps', 132],
    ['o2c', 'Order management specialists', 17],
    ['l2o', 'Key account managers', 11]
  ],
  instr: `You are the Where's My Order Assistant for Meridian Consumer Brands. Customer care reps ask about orders while on the phone or in chat.

1. Find the order with lookup_order_status (accept PO number, SAP order number or customer + date).
2. If it has shipped, call get_shipment_eta.
3. Answer in one or two sentences: status, carrier, ETA and anything the rep must tell the customer.
4. If the rep asks, save the answer with add_case_note.

Never promise a delivery date earlier than the carrier ETA. Do not discuss pricing or credit.`,
  guard: ['Read-only on SAP orders.', 'No pricing or credit information in answers.', 'Reps see only accounts in their care queue.'],
  use: { rpd: 15800, ms: 0.4, tin: 3800, tout: 260, inv: 61200, pat: 'chat', trend: 0.04, err: 0.4, p95: 2400 },
  fees: [],
  telemetry: ['Gemini Enterprise usage reports', 'Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=i2r-wismo']
},
{
  id: 'q2c-price-guard', name: 'Pricing Guardrail Agent', home: 'q2c', status: 'production',
  arch: 'monitoring', auto: 2, health: 'healthy',
  owner: 'Sofia Alvarez', ownerTitle: 'VP Pricing & Revenue Management',
  version: '2.1.0', deployed: '2026-01-12', updated: '2026-10-21',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-q2c-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Event: every new sales order and every submitted quote',
  short: 'Checks every order and quote against floor prices and can put an order on price-review hold, with a pricing analyst approving.',
  desc: 'Owned by Pricing, but it acts on Order-to-Cash: it can place a price-review hold on a sales order. That write into another process is why it is flagged in O2C’s cross-process section.',
  inputs: [
    ['SAP S/4HANA · Pricing conditions', 'Contract and list prices', 'q2c', 'r'],
    ['BigQuery · pricing_mart.floor_prices', 'Floor price matrix by SKU and channel', 'q2c', 'r'],
    ['SAP S/4HANA · Sales orders', 'New orders and line prices', 'o2c', 'r']
  ],
  tools: [
    ['get_floor_price', 'Floor price for SKU, customer tier and channel.', 'BigQuery · pricing_mart', 'q2c', 'r', '', 4],
    ['compare_order_price', 'Compares net price with the floor.', 'Internal', 'q2c', 'r', '', 3],
    ['hold_order_for_price_review', 'Places a price-review hold on the order.', 'SAP S/4HANA · SD', 'o2c', 'w', 'Pricing analyst', 0.3],
    ['notify_deal_owner', 'Tells the account owner why.', 'Google Chat', 'q2c', 'w', '', 0.3]
  ],
  outputs: [
    ['SAP S/4HANA · Order holds', 'Price-review holds on sales orders', 'o2c', 'w'],
    ['BigQuery · pricing_mart.leakage_log', 'Below-floor events', 'q2c', 'w']
  ],
  users: [['q2c', 'Pricing analysts', 11], ['o2c', 'Order management specialists', 9]],
  instr: `You are the Pricing Guardrail Agent for Meridian Consumer Brands. Check each new order and quote line against floor prices. If the net price is below floor by more than 1%, request a hold with hold_order_for_price_review (a pricing analyst approves) and notify the deal owner. Otherwise log nothing and finish quickly.`,
  guard: ['Holds need pricing analyst approval.', 'Cannot change prices.', 'Max 200 hold requests per day.'],
  use: { rpd: 7600, ms: 0.15, tin: 1800, tout: 120, inv: 104500, pat: 'web', trend: 0.05, err: 0.2, p95: 900 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=q2c-price-guard']
},
{
  id: 'f2s-demand', name: 'Demand Sensing Agent', home: 'f2s', status: 'production',
  arch: 'analytical', auto: 2, health: 'healthy',
  owner: 'Tomasz Nowak', ownerTitle: 'VP Integrated Supply Planning',
  version: '2.3.0', deployed: '2025-11-17', updated: '2026-11-02',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-f2s-agents-prod', region: 'us-central1',
  model: 'gemini-3-pro', temp: 0.1,
  trigger: 'Schedule: daily 04:00 ET',
  short: 'Adjusts the 0–6 week forecast using open orders, retailer POS, promotions and weather, and proposes changes to demand planners.',
  desc: 'Reads open orders from Order-to-Cash and POS and promotions from Lead-to-Order, fits a short-term forecast and proposes adjustments in SAP IBP. It also publishes a demand signal that Logistics uses for DC staffing.',
  inputs: [
    ['SAP S/4HANA · Open orders', 'Order backlog by SKU and DC', 'o2c', 'r'],
    ['Circana · Retailer POS', 'Weekly sell-through by store', 'l2o', 'r'],
    ['SAP TPM · Promo calendar', 'Planned promotions', 'l2o', 'r'],
    ['BigQuery · weather & events', 'Weather and local events', 'f2s', 'r']
  ],
  tools: [
    ['get_open_orders', 'Open orders by SKU, DC and week.', 'SAP S/4HANA · SD', 'o2c', 'r', '', 2],
    ['get_pos_sellthrough', 'POS by SKU and retailer.', 'Circana', 'l2o', 'r', '', 2],
    ['get_promo_calendar', 'Upcoming promotions.', 'SAP TPM', 'l2o', 'r', '', 1],
    ['fit_short_term_forecast', 'Fits the 0–6 week model.', 'Vertex AI · forecasting', 'f2s', 'r', '', 1],
    ['push_forecast_adjustment', 'Proposes adjustments in IBP.', 'SAP IBP', 'f2s', 'w', 'Demand planner', 0.5]
  ],
  outputs: [['SAP IBP · Forecast adjustments', 'Proposed adjustments', 'f2s', 'w'], ['BigQuery · logistics.demand_signal', 'Daily demand signal for DCs', 'i2d', 'w']],
  users: [['f2s', 'Demand planners', 24], ['i2d', 'DC managers', 6], ['l2o', 'Revenue managers', 4]],
  instr: `You are the Demand Sensing Agent for Meridian Consumer Brands. Each morning, adjust the 0-6 week forecast. Use open orders, POS, promotions and weather. Propose an adjustment only when it changes the forecast by more than 5% for a SKU-DC-week, and explain the main driver. Demand planners approve each adjustment.`,
  guard: ['Adjustments proposed, planners approve.', 'No changes beyond week 6.'],
  use: { rpd: 1600, ms: 0.4, tin: 16000, tout: 1500, inv: 30, pat: 'daily', trend: 0.0, err: 0.3, p95: 48000 },
  fees: [['Vertex AI forecasting', 'node-hour', 21.25, 18]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=f2s-demand']
},
{
  id: 'p2p-ap-invoice', name: 'AP Invoice Processing Agent', home: 'p2p', status: 'production',
  arch: 'automation', auto: 3, health: 'healthy',
  owner: 'Daniel Cho', ownerTitle: 'Chief Procurement Officer',
  version: '3.0.1', deployed: '2025-09-15', updated: '2026-10-19',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-p2p-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Event: invoice arrives in Coupa or the AP mailbox',
  short: 'Extracts supplier invoices, runs the three-way match and posts clean invoices to SAP, which writes to the general ledger.',
  desc: 'Homed in Procure-to-Pay, but every invoice it posts hits the general ledger, so it is one of the biggest writers into Record-to-Report.',
  inputs: [
    ['Coupa · Supplier invoices', 'Invoices submitted via supplier portal', 'p2p', 'r'],
    ['Gmail · AP inbox', 'PDF invoices', 'p2p', 'r'],
    ['SAP S/4HANA · MM', 'Purchase orders and goods receipts', 'p2p', 'r']
  ],
  tools: [
    ['extract_invoice', 'Extracts header and lines.', 'Document AI · Invoice parser', 'p2p', 'r', '', 2],
    ['three_way_match', 'Matches invoice, PO and goods receipt.', 'SAP S/4HANA · MM', 'p2p', 'r', '', 3],
    ['post_ap_invoice', 'Posts the invoice (AP and GL).', 'SAP S/4HANA · FI', 'r2r', 'w', '', 1],
    ['route_exception', 'Sends mismatches to the AP queue.', 'Coupa', 'p2p', 'w', '', 0.4]
  ],
  outputs: [['SAP S/4HANA · FI (AP + GL)', 'Posted invoices and GL entries', 'r2r', 'w'], ['Coupa · Exception queue', 'Invoices needing review', 'p2p', 'w']],
  users: [['p2p', 'AP specialists', 28], ['r2r', 'GL accountants', 4]],
  instr: `You are the AP Invoice Processing Agent for Meridian Consumer Brands. Extract each invoice, run three_way_match and post only when price and quantity match within tolerance (1% or $50). Route everything else with the reason. Never post an invoice for a vendor with a bank detail change in the last 10 days.`,
  guard: ['Posting only within 1% / $50 tolerance.', 'Vendor bank-change cooling-off of 10 days.', 'Duplicate invoice check before posting.'],
  use: { rpd: 12500, ms: 0.3, tin: 3000, tout: 350, inv: 58900, pat: 'weekday', trend: 0.03, err: 0.5, p95: 3300 },
  fees: [['Document AI · Invoice parser', '1k pages', 30.0, 71.2]],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=p2p-ap-invoice', 'Document AI processor metrics']
},
{
  id: 'a2r-fixed-asset', name: 'Fixed Asset Lifecycle Agent', home: 'a2r', status: 'production',
  arch: 'automation', auto: 2, health: 'healthy',
  owner: 'Luis Ferreira', ownerTitle: 'VP Engineering & Maintenance',
  version: '1.2.3', deployed: '2026-03-02', updated: '2026-10-28',
  platform: 'Vertex AI Agent Engine', framework: 'Google ADK (Python) 1.18', project: 'mrd-a2r-agents-prod', region: 'us-east4',
  model: 'gemini-3-flash', temp: 0.0,
  trigger: 'Event: capex goods receipt; Schedule: close WD-1 depreciation check',
  short: 'Creates asset records from capex receipts, checks the depreciation run and parks disposal entries for approval.',
  desc: 'Keeps the asset register in step with what plants actually buy, retire and scrap. Its disposal and depreciation entries post to the general ledger, a write into Record-to-Report.',
  inputs: [['SAP S/4HANA · MM', 'Capex POs and goods receipts', 'p2p', 'r'], ['SAP S/4HANA · FI-AA', 'Asset register', 'a2r', 'r'], ['SAP PM', 'Retirement and scrap notices', 'a2r', 'r']],
  tools: [
    ['capitalize_asset', 'Creates the asset record from the receipt.', 'SAP S/4HANA · FI-AA', 'a2r', 'w', 'Fixed asset accountant', 1],
    ['run_depreciation_check', 'Compares planned and posted depreciation.', 'SAP S/4HANA · FI-AA', 'a2r', 'r', '', 2],
    ['post_disposal_entry', 'Parks the disposal JE.', 'SAP S/4HANA · GL', 'r2r', 'w', 'Fixed asset accountant', 0.4]
  ],
  outputs: [['SAP S/4HANA · FI-AA', 'New asset records', 'a2r', 'w'], ['SAP S/4HANA · GL', 'Disposal and depreciation entries', 'r2r', 'w']],
  users: [['a2r', 'Fixed asset accountants', 7], ['r2r', 'GL accountants', 3], ['p2p', 'Capex buyers', 2]],
  instr: `You are the Fixed Asset Lifecycle Agent for Meridian Consumer Brands. Create asset records from capex receipts using the asset class rules. At close WD-1, run_depreciation_check and report differences. Park disposal entries for approval; never post them directly.`,
  guard: ['All asset creations and disposals need a fixed asset accountant.', 'No changes to depreciation keys.'],
  use: { rpd: 480, ms: 0.35, tin: 2800, tout: 300, inv: 1300, pat: 'close', trend: 0.0, err: 0.3, p95: 2900 },
  fees: [],
  telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=a2r-fixed-asset']
}
];

/* ------------------------------------------------------------------------------------------
   LIGHT SAMPLE AGENTS for processes not detailed yet.
   [id, name, home, arch, autonomy, model, short, inputs, tools, outputs, users, rpd, inv, status]
   tools here: [name, system, bp, mode, approvalBy]
------------------------------------------------------------------------------------------- */
window.LIGHT_AGENTS = [
  ['i2m-formulation', 'Formulation Insights Agent', 'i2m', 'analytical', 1, 'gemini-3-pro',
    'Mines lab results and consumer reviews to suggest formulation changes to R&D scientists.',
    [['LabWare LIMS', 'Stability and lab results', 'i2m', 'r'], ['Bazaarvoice', 'Consumer reviews', 'i2m', 'r']],
    [['query_lims', 'LabWare LIMS', 'i2m', 'r', ''], ['cluster_review_themes', 'BigQuery · consumer_reviews', 'i2m', 'r', '']],
    [['Google Drive · R&D insights', 'Formulation insight briefs', 'i2m', 'w']],
    [['i2m', 'R&D scientists', 31]], 640, 900],
  ['i2m-claims', 'Claims Substantiation Checker', 'i2m', 'monitoring', 1, 'gemini-3-pro',
    'Checks proposed packaging and marketing claims against test evidence and regulatory rules.',
    [['Veeva Vault · Claims evidence', 'Test evidence library', 'i2m', 'r'], ['Vertex AI Search · Regulatory rules', 'Claim rules by market', 'c2c', 'r']],
    [['retrieve_evidence', 'Veeva Vault', 'i2m', 'r', ''], ['check_regulatory_rule', 'Vertex AI Search', 'c2c', 'r', ''], ['log_claim_review', 'Veeva Vault · Claim reviews', 'c2c', 'w', '']],
    [['Veeva Vault · Claim reviews', 'Claim review records', 'c2c', 'w']],
    [['i2m', 'Brand managers', 18], ['c2c', 'Regulatory counsel', 5]], 380, 520],
  ['l2o-retail-media', 'Retail Media Optimizer', 'l2o', 'automation', 2, 'gemini-3-flash',
    'Rebalances retail media budgets across Amazon Ads and Walmart Connect within approved limits.',
    [['Amazon Ads', 'Campaign performance', 'l2o', 'r'], ['Walmart Connect', 'Campaign performance', 'l2o', 'r']],
    [['get_campaign_metrics', 'Amazon Ads', 'l2o', 'r', ''], ['apply_budget_shift', 'Amazon Ads', 'l2o', 'w', 'Media planner'], ['publish_spend_accrual', 'BigQuery · finance_accruals', 'r2r', 'w', '']],
    [['BigQuery · media.budget_changes', 'Budget change log', 'l2o', 'w'], ['BigQuery · finance_accruals.media_spend', 'Media spend accrual feed', 'r2r', 'w']],
    [['l2o', 'Media planners', 12]], 2900, 4300],
  ['l2o-account-plan', 'Account Planning Copilot', 'l2o', 'conversational', 1, 'gemini-3-pro',
    'Helps key account managers prepare retailer meetings from sell-through, promotion and share data.',
    [['Salesforce Sales Cloud', 'Accounts and opportunities', 'l2o', 'r'], ['Circana · Retailer POS', 'Sell-through and share', 'l2o', 'r'], ['SAP S/4HANA · Open orders', 'Open orders for the account', 'o2c', 'r']],
    [['summarize_account', 'Salesforce Sales Cloud', 'l2o', 'r', ''], ['get_open_orders', 'SAP S/4HANA · SD', 'o2c', 'r', ''], ['draft_meeting_brief', 'Google Docs', 'l2o', 'w', '']],
    [['Google Docs · Meeting briefs', 'Account meeting briefs', 'l2o', 'w']],
    [['l2o', 'Key account managers', 64], ['o2c', 'Customer operations', 6]], 3100, 5200],
  ['q2c-deal-desk', 'Deal Desk Copilot', 'q2c', 'conversational', 2, 'gemini-3-pro',
    'Configures complex distributor deals and drafts quotes with margin checks.',
    [['Salesforce CPQ', 'Products, price books, quotes', 'q2c', 'r'], ['Icertis CLM', 'Contract clause library', 'c2c', 'r']],
    [['configure_quote', 'Salesforce CPQ', 'q2c', 'w', 'Deal desk analyst'], ['check_margin', 'BigQuery · pricing_mart', 'q2c', 'r', ''], ['fetch_contract_clause', 'Icertis CLM', 'c2c', 'r', '']],
    [['Salesforce CPQ · Draft quotes', 'Draft quotes', 'q2c', 'w']],
    [['q2c', 'Deal desk and pricing analysts', 21], ['l2o', 'Sales reps', 12]], 1200, 1900],
  ['f2s-changeover', 'Line Changeover Planner', 'f2s', 'automation', 2, 'gemini-3-flash',
    'Sequences production runs to cut changeover time on packaging lines.',
    [['SAP IBP · Supply plan', 'Planned production', 'f2s', 'r'], ['Rockwell FactoryTalk MES', 'Line status', 'f2s', 'r'], ['SAP PM', 'Maintenance windows', 'a2r', 'r']],
    [['get_line_status', 'FactoryTalk MES', 'f2s', 'r', ''], ['get_maintenance_windows', 'SAP PM', 'a2r', 'r', ''], ['publish_schedule', 'SAP S/4HANA · PP', 'f2s', 'w', 'Plant scheduler']],
    [['SAP S/4HANA · Production schedule', 'Sequenced runs', 'f2s', 'w']],
    [['f2s', 'Plant schedulers', 14]], 760, 620],
  ['i2d-carrier', 'Carrier Exception Agent', 'i2d', 'automation', 3, 'gemini-3-flash',
    'Rebooks late or rejected truckloads and updates the delivery date on the customer order.',
    [['project44', 'Shipment events', 'i2d', 'r'], ['Blue Yonder TMS', 'Loads and carrier tenders', 'i2d', 'r']],
    [['get_shipment_events', 'project44', 'i2d', 'r', ''], ['rebook_load', 'Blue Yonder TMS', 'i2d', 'w', ''], ['update_delivery_date', 'SAP S/4HANA · SD', 'o2c', 'w', '']],
    [['SAP S/4HANA · Sales orders', 'Updated delivery dates', 'o2c', 'w'], ['BigQuery · finance_accruals.freight', 'Freight accrual adjustments', 'r2r', 'w']],
    [['i2d', 'Transportation planners', 19], ['o2c', 'Order management specialists', 8]], 5400, 7800],
  ['i2d-slotting', 'Warehouse Slotting Advisor', 'i2d', 'analytical', 1, 'gemini-3-flash',
    'Recommends pick-face slotting changes from pick velocity and the demand forecast.',
    [['Manhattan WMS', 'Pick history and locations', 'i2d', 'r'], ['SAP IBP · Demand plan', 'Forecast by SKU', 'f2s', 'r']],
    [['query_pick_velocity', 'Manhattan WMS', 'i2d', 'r', ''], ['get_forecast', 'SAP IBP', 'f2s', 'r', '']],
    [['Looker · Slotting recommendations', 'Slotting moves by DC', 'i2d', 'w']],
    [['i2d', 'DC managers', 11]], 260, 180],
  ['i2r-returns', 'Returns & Warranty Triage', 'i2r', 'automation', 2, 'gemini-3-flash',
    'Triages return requests, approves standard RMAs and requests credit memos from Billing.',
    [['Salesforce Service Cloud', 'Return and warranty cases', 'i2r', 'r'], ['SAP S/4HANA · Orders and invoices', 'Original order and invoice', 'o2c', 'r'], ['Vertex AI Search · Return policy', 'Return and warranty policy', 'c2c', 'r']],
    [['check_return_eligibility', 'Vertex AI Search', 'c2c', 'r', ''], ['create_rma', 'SAP S/4HANA · SD', 'i2r', 'w', ''], ['request_credit_memo', 'SAP S/4HANA · SD Billing', 'o2c', 'w', 'Billing analyst']],
    [['SAP S/4HANA · RMAs', 'Return authorizations', 'i2r', 'w'], ['SAP S/4HANA · Credit memo requests', 'Credit memo requests', 'o2c', 'w']],
    [['i2r', 'Returns specialists', 23], ['o2c', 'Billing analysts', 5]], 2300, 3600],
  ['p2p-supplier-risk', 'Supplier Risk Monitor', 'p2p', 'monitoring', 1, 'gemini-3-flash',
    'Watches news, financial health and delivery performance for the top 400 suppliers.',
    [['Coupa · Supplier master', 'Suppliers and spend', 'p2p', 'r'], ['EcoVadis', 'Supplier ratings', 'p2p', 'r'], ['SAP S/4HANA · MM', 'On-time in-full', 'p2p', 'r']],
    [['score_supplier', 'BigQuery · supplier_risk', 'p2p', 'r', ''], ['post_alert', 'Google Chat', 'p2p', 'w', ''], ['open_risk_case', 'ServiceNow IRM', 'id2m', 'w', '']],
    [['ServiceNow IRM · Risk cases', 'Supplier risk cases', 'id2m', 'w']],
    [['p2p', 'Category managers', 27], ['id2m', 'Third-party risk analysts', 4]], 900, 1100],
  ['h2r-scheduling', 'Interview Scheduling Assistant', 'h2r', 'conversational', 2, 'gemini-3-flash',
    'Coordinates interview loops across interviewer calendars for recruiters.',
    [['Workday Recruiting', 'Requisitions and candidates', 'h2r', 'r'], ['Google Calendar', 'Interviewer availability', 'h2r', 'r']],
    [['find_slots', 'Google Calendar', 'h2r', 'r', ''], ['send_invites', 'Google Calendar', 'h2r', 'w', 'Recruiter']],
    [['Google Calendar · Interview events', 'Scheduled interviews', 'h2r', 'w']],
    [['h2r', 'Recruiters and coordinators', 16]], 1500, 2100],
  ['h2r-payroll', 'Payroll Variance Agent', 'h2r', 'monitoring', 1, 'gemini-3-flash',
    'Flags unusual payroll swings before each pay run and prepares the payroll accrual for Finance.',
    [['Workday Payroll', 'Pay results by employee', 'h2r', 'r'], ['UKG Time', 'Hours and overtime', 'h2r', 'r']],
    [['compare_pay_runs', 'Workday Payroll', 'h2r', 'r', ''], ['prepare_accrual', 'BigQuery · finance_accruals.payroll', 'r2r', 'w', '']],
    [['BigQuery · finance_accruals.payroll', 'Payroll accrual file', 'r2r', 'w']],
    [['h2r', 'Payroll specialists', 6], ['r2r', 'GL accountants', 3]], 240, 90],
  ['a2r-work-orders', 'Maintenance Work Order Agent', 'a2r', 'automation', 2, 'gemini-3-flash',
    'Turns machine sensor alerts into SAP PM work orders and reserves the downtime window with Planning.',
    [['Litmus Edge · Plant sensors', 'Vibration and temperature alerts', 'a2r', 'r'], ['SAP PM', 'Equipment and work orders', 'a2r', 'r']],
    [['create_work_order', 'SAP PM', 'a2r', 'w', ''], ['reserve_downtime_window', 'FactoryTalk MES', 'f2s', 'w', 'Plant scheduler']],
    [['SAP PM · Work orders', 'Work orders', 'a2r', 'w'], ['FactoryTalk MES · Downtime', 'Reserved downtime', 'f2s', 'w']],
    [['a2r', 'Maintenance planners', 21], ['f2s', 'Plant schedulers', 6]], 1800, 2400],
  ['r2d-service-desk', 'IT Service Desk Agent', 'r2d', 'conversational', 3, 'gemini-3-flash',
    'Resolves common IT requests for employees: password resets, software access and VPN problems.',
    [['ServiceNow ITSM', 'Tickets and catalog', 'r2d', 'r'], ['ServiceNow Knowledge', 'IT knowledge articles', 'r2d', 'r'], ['Okta', 'User accounts', 'r2d', 'r']],
    [['search_kb', 'ServiceNow Knowledge', 'r2d', 'r', ''], ['reset_password', 'Okta', 'r2d', 'w', ''], ['create_ticket', 'ServiceNow ITSM', 'r2d', 'w', '']],
    [['ServiceNow ITSM · Tickets', 'Resolved and escalated tickets', 'r2d', 'w']],
    [['r2d', 'Employees (all functions)', 1840]], 11000, 16500],
  ['r2d-access', 'Access Request Reviewer', 'r2d', 'automation', 2, 'gemini-3-pro',
    'Reviews SAP and Salesforce access requests for segregation-of-duties conflicts before approval.',
    [['ServiceNow · Access requests', 'Role requests', 'r2d', 'r'], ['SAP GRC · SoD rules', 'Conflict rule set', 'id2m', 'r']],
    [['check_sod', 'SAP GRC', 'id2m', 'r', ''], ['approve_request', 'ServiceNow', 'r2d', 'w', 'IAM analyst']],
    [['ServiceNow · Access decisions', 'Approved and rejected requests', 'r2d', 'w']],
    [['r2d', 'IAM analysts', 7], ['id2m', 'Compliance analysts', 2]], 700, 980],
  ['c2c-contract-review', 'Contract Review Copilot', 'c2c', 'conversational', 2, 'gemini-3-pro',
    'Redlines vendor and customer contracts against Meridian’s legal playbook.',
    [['Icertis CLM', 'Contracts and versions', 'c2c', 'r'], ['Vertex AI Search · Legal playbook', 'Fallback positions', 'c2c', 'r']],
    [['compare_to_playbook', 'Vertex AI Search', 'c2c', 'r', ''], ['suggest_redlines', 'Icertis CLM', 'c2c', 'w', 'Counsel']],
    [['Icertis CLM · Redlines', 'Suggested redlines', 'c2c', 'w']],
    [['c2c', 'Counsel and contract managers', 14], ['p2p', 'Category managers', 10], ['l2o', 'Sales leaders', 6]], 1100, 1400],
  ['c2c-obligations', 'Obligation Tracker', 'c2c', 'monitoring', 1, 'gemini-3-flash',
    'Tracks rebate, volume-tier and price-protection obligations in customer contracts and alerts owners.',
    [['Icertis CLM', 'Customer contracts', 'c2c', 'r'], ['SAP S/4HANA · Invoiced volume', 'Volume by customer', 'o2c', 'r']],
    [['extract_obligations', 'Icertis CLM', 'c2c', 'r', ''], ['check_volume_tier', 'BigQuery · o2c_mart', 'o2c', 'r', ''], ['notify_owner', 'Google Chat', 'l2o', 'w', '']],
    [['BigQuery · finance_accruals.rebates', 'Rebate accrual signal', 'r2r', 'w']],
    [['c2c', 'Contract managers', 8], ['l2o', 'Account owners', 5], ['r2r', 'Revenue accountants', 2]], 420, 300],
  ['s2e-scenario', 'FP&A Scenario Analyst', 's2e', 'analytical', 1, 'gemini-3-pro',
    'Builds what-if scenarios on volume, price and input costs for the monthly forecast.',
    [['BigQuery · finance_mart', 'Actuals', 'r2r', 'r'], ['SAP IBP · Demand plan', 'Volume plan', 'f2s', 'r'], ['S&P Global · Commodities', 'Resin, pulp, palm oil prices', 's2e', 'r']],
    [['get_actuals', 'BigQuery · finance_mart', 'r2r', 'r', ''], ['get_demand_plan', 'SAP IBP', 'f2s', 'r', ''], ['run_scenario', 'BigQuery · fpa_models', 's2e', 'r', '']],
    [['Google Sheets · Scenario pack', 'Scenario outputs', 's2e', 'w']],
    [['s2e', 'FP&A analysts', 17]], 540, 700],
  ['id2m-fraud', 'Fraud Pattern Sentinel', 'id2m', 'monitoring', 2, 'gemini-3-pro',
    'Scans vendor bank changes, payment runs and web orders for fraud patterns and can hold a payment.',
    [['SAP S/4HANA · Vendor master changes', 'Bank detail changes', 'p2p', 'r'], ['SAP S/4HANA · Payment runs', 'Proposed payments', 'p2p', 'r'], ['Salesforce Commerce Cloud', 'Web orders', 'o2c', 'r']],
    [['score_transaction', 'BigQuery ML · fraud_model', 'id2m', 'r', ''], ['hold_payment', 'SAP S/4HANA · FI', 'p2p', 'w', 'Fraud analyst'], ['open_investigation', 'ServiceNow IRM', 'id2m', 'w', '']],
    [['ServiceNow IRM · Investigations', 'Fraud investigations', 'id2m', 'w'], ['SAP S/4HANA · Payment blocks', 'Held payments', 'p2p', 'w']],
    [['id2m', 'Fraud analysts', 6], ['p2p', 'Treasury & AP', 3]], 3400, 5100],
  ['id2m-reg-watch', 'Regulatory Change Watcher', 'id2m', 'monitoring', 1, 'gemini-3-flash',
    'Monitors FDA, FTC and EU regulatory updates and maps them to affected products and policies.',
    [['Regulatory feeds', 'FDA, FTC, EU OJ updates', 'id2m', 'r'], ['Salsify PIM', 'Product catalog', 'i2m', 'r']],
    [['map_to_products', 'Salsify PIM', 'i2m', 'r', ''], ['create_policy_task', 'ServiceNow IRM', 'id2m', 'w', '']],
    [['ServiceNow IRM · Impact assessments', 'Regulatory impact tasks', 'id2m', 'w']],
    [['id2m', 'Compliance analysts', 9], ['i2m', 'Regulatory affairs (R&D)', 7]], 210, 60],
  ['m2i-mining', 'Process Mining Analyst', 'm2i', 'analytical', 1, 'gemini-3-pro',
    'Finds bottlenecks and rework loops in O2C and P2P event logs and explains likely root causes.',
    [['BigQuery · SAP event log (O2C)', 'Order-to-cash events', 'o2c', 'r'], ['BigQuery · SAP event log (P2P)', 'Procure-to-pay events', 'p2p', 'r']],
    [['query_event_log', 'BigQuery · process_mining', 'o2c', 'r', ''], ['query_event_log_p2p', 'BigQuery · process_mining', 'p2p', 'r', ''], ['file_improvement', 'Jira · CI backlog', 'm2i', 'w', '']],
    [['Jira · CI backlog', 'Improvement opportunities', 'm2i', 'w']],
    [['m2i', 'CI leads', 8], ['o2c', 'O2C process owners', 4], ['p2p', 'P2P process owners', 3]], 310, 240],
  ['s2v-esg', 'ESG Data Steward', 's2v', 'automation', 2, 'gemini-3-flash',
    'Collects energy, water and Scope 3 data for ESG reporting and chases suppliers for gaps.',
    [['Plant energy meters', 'Energy and water by plant', 'a2r', 'r'], ['EcoVadis', 'Supplier emissions', 'p2p', 'r'], ['project44', 'Logistics emissions', 'i2d', 'r']],
    [['aggregate_metrics', 'BigQuery · esg', 's2v', 'r', ''], ['request_supplier_data', 'Coupa', 'p2p', 'w', 'Sustainability analyst']],
    [['Workiva · ESG dataset', 'ESG metrics', 's2v', 'w']],
    [['s2v', 'Sustainability analysts', 6], ['p2p', 'Category managers', 4]], 380, 260],
  ['s2v-earnings', 'Earnings Prep Copilot', 's2v', 'conversational', 1, 'gemini-3-pro',
    'Drafts earnings call Q&A prep from results, guidance and past analyst questions.',
    [['Workiva · Results', 'Quarterly results', 'r2r', 'r'], ['Analyst call transcripts', 'Past Q&A', 's2v', 'r']],
    [['draft_qa_prep', 'Google Docs', 's2v', 'w', 'IR lead']],
    [['Google Docs · Q&A prep', 'Draft Q&A', 's2v', 'w']],
    [['s2v', 'Investor relations', 4]], 0, 0, 'review']
];

/* ------------------------------------------------------------------------------------------
   HOME RULE: an agent's home is the process that owns the work it does.
     conversational -> the people who use it most          (basis: users)
     automation     -> the process that owns the step it runs (basis: step)
     analytical     -> the people who act on its output       (basis: decision)
     monitoring     -> the people who act on its alerts       (basis: alerts)
     unclear        -> the accountable owner's process        (basis: owner)
   home_subprocess is what the onboarder picks; home_process follows from it.
   null = the agent spans every step of its home process.
------------------------------------------------------------------------------------------- */
window.HOME_SUBPROCESS = {
  'o2c-intake': 'Order capture', 'o2c-credit': 'Credit management', 'o2c-collections': 'Collections',
  'o2c-cashapp': 'Cash application', 'o2c-billing': 'Billing', 'o2c-deductions': 'Deductions & disputes',
  'o2c-pulse': null, 'o2c-returns': 'Billing', 'o2c-portal': 'Order capture',
  'r2r-recon': 'Account reconciliation', 'r2r-je-review': 'Journal entries', 'r2r-close': 'Month-end close',
  'r2r-flux': 'Month-end close', 'r2r-interco': 'Intercompany', 'r2r-rev-accrual': 'Accruals & revenue',
  'r2r-tax': 'Tax', 'r2r-ext-report': 'External reporting', 'r2r-lease': 'Month-end close',
  'i2r-wismo': 'Order inquiries', 'q2c-price-guard': 'Pricing', 'f2s-demand': 'Demand sensing',
  'p2p-ap-invoice': 'Invoice processing', 'a2r-fixed-asset': 'Depreciation',
  'i2m-formulation': 'Formulation', 'i2m-claims': 'Claims & testing',
  'l2o-retail-media': 'Retail media', 'l2o-account-plan': 'Account planning',
  'q2c-deal-desk': 'Deal configuration', 'f2s-changeover': 'Production scheduling',
  'i2d-carrier': 'Transportation', 'i2d-slotting': 'Slotting', 'i2r-returns': 'Returns & RMAs',
  'p2p-supplier-risk': 'Supplier risk', 'h2r-scheduling': 'Recruiting', 'h2r-payroll': 'Payroll',
  'a2r-work-orders': 'Maintenance', 'r2d-service-desk': 'Service desk', 'r2d-access': 'Access management',
  'c2c-contract-review': 'Drafting & review', 'c2c-obligations': 'Obligations', 's2e-scenario': 'Forecasting',
  'id2m-fraud': 'Fraud prevention', 'id2m-reg-watch': 'Regulatory monitoring', 'm2i-mining': 'Process mining',
  's2v-esg': 'ESG reporting', 's2v-earnings': 'Investor relations'
};
/* Only needed where the basis differs from the archetype default, or a close call is worth recording. */
window.HOME_BASIS_NOTE = {
  'r2r-flux': 'Close call: FP&A in Strategy-to-Execution also relies on its commentary. Controllers approve it, so the analytical rule puts it in R2R.',
  'o2c-pulse': 'Covers every O2C step, so it has no single sub-process.'
};
