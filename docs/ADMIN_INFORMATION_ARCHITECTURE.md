# Sulandra Admin Information Architecture

## Ownership

Sulandra Health Admin is the enterprise control plane. SPIRE remains a separate clinical and client-record application inside the platform. Public application, referral-token, applicant, patient, and employee-role entry pages are workflow destinations and must not become global administrator controls.

The canonical route sources are:

- `config/admin-route-inventory.json`: every root HTML route and its disposition.
- `assets/admin-navigation-registry.js`: the only source for Admin folders, top actions, company-scoped visibility, Enterprise Apps, and the Hiring & Onboarding lifecycle.
- `assets/admin-information-architecture.js`: presentation and interaction only. It must not duplicate route definitions.
- `assets/admin-onboarding-workflow.js`: presentation of the existing recruiting statuses; it does not invent backend statuses or bypass API authorization.

## Navigation model

The top bar is limited to Dashboard, My Work, Notifications, the existing company selector, administrator profile, and sign out. Tool discovery belongs in the searchable left navigation.

The eight folders are applied in this order:

1. Company Management
2. People & HR
3. Clients & SPIRE
4. Service Operations
5. Billing & Revenue
6. Compliance & Quality
7. Communications & Learning
8. System Administration

Company-specific links are visible only for the selected legal entity. UI visibility is convenience only; backend role, company, legal-entity, and department enforcement remains authoritative.

## Hiring & Onboarding lifecycle

The lifecycle is:

1. Overview
2. Job Openings
3. New Applicants
4. Review & Screening
5. Interviews
6. Offers
7. Pre-employment
8. Activation & Orientation
9. Archive

Client Service Requests are an operations function and are mounted as their own Admin module, outside Hiring & Onboarding.

## Route dispositions

- `navigation`: a canonical folder or top-action destination.
- `contextual`: opened from a parent workflow, record, invitation, or role workspace.
- `entry`: public, authentication, employee, applicant, or portal entry.
- `alias`: compatibility route retained only to redirect to its canonical destination.
- `setup`: bootstrap-only system surface.

Adding a root HTML page requires an inventory entry. Adding an Admin navigation item requires a registry entry. CI must fail on missing files, duplicate IDs, missing inventory coverage, invalid company scopes, public routes exposed as Admin controls, or a route target that is not published.

## Release process

1. Develop on an isolated branch from `release/sulandra-1.1`.
2. Run registry, route, canonical Admin, build, and role/company validation.
3. Open a draft PR targeting `release/sulandra-1.1`.
4. Merge only after CI and review.
5. Validate on the Sulandra 1.1 Staging Canary frontend.
6. Do not change the production `release/sulandra-1.0` services until explicit production approval and a rollback point exist.

