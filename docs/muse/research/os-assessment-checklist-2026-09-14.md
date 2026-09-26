# OS assessment checklist — 2026-09-14

> Uploaded by Robert on 2026-09-14 and retired the same day into Roadmap Phases I–M
> (`../roadmap.md`). Kept as the record of what the phases were sequenced from.

3. Missing Features & Functions Checklist
While the engine is robust, the OS is still a late-stage prototype. To be a complete operating system for this business and others, it is missing several practical execution and back-office features:

Operations & Execution

 Kitchen Operator UI: Currently, actuals and batch closures can only be recorded by "super admins." It lacks a simplified, tablet-friendly interface for line cooks and receivers to log data (e.g., actual yield, scrap, temps) on the floor.
 Hardware / IoT Integrations: There is no integration with barcode scanners for GS1 traceability lot tracking, nor IoT integrations with blast chillers or ovens for automated HACCP/CCP temperature logging.
 Advanced Multi-Station Scheduling: The system currently schedules based on the blast chiller constraint. It does not yet map cross-station routing (kettles vs. combi ovens vs. prep tables) as independently bookable resources.
 Inventory Expiry Tracking: While hold-life is modeled (FIFO shipping), there is no tracking for raw material expiry (receipts currently carry no use-by dates).
Finance & Accounting

 Period Close & Lock: Missing formal month-end period lock mechanisms and an immutable posting audit trail (crucial for CPA audits).
 Working Capital Mechanics: Accounts Receivable (collections) and Accounts Payable terms (DSO, DPO) are not actively modeled. The system currently assumes everything is settled within the year.
 Payroll Integration: Labor costs are based on time-study standards and fixed modeling. It lacks integration with actual payroll systems (like ADP or Gusto) to post accrued wages vs. actuals.
 Payments / Invoicing: The payment gateway for B2B (schools/corporate) and B2C (parent portal) is entirely unbuilt.
Distribution & Supply Chain

 Supplier Portals / EDI: Purchase orders are generated internally, but there is no electronic data interchange (EDI) or vendor portal for suppliers to acknowledge POs or update live pricing.
 Logistics/Routing: While delivery sites exist, there is no route optimization or integration with third-party logistics (3PL) systems for driver manifests.