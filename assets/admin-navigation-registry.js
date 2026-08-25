(() => {
  'use strict';
  const data = {
  "version": "2.0.0",
  "folders": [
    {
      "id": "company-management",
      "label": "Company Management",
      "icon": "▣",
      "description": "Company identity, locations, official records and legal-entity controls.",
      "items": [
        {
          "id": "service-homes",
          "label": "Service Homes",
          "sub": "Homes and service locations",
          "kind": "module",
          "module": "service-homes",
          "href": "/admin.html#service-homes",
          "icon": "⌂",
          "tone": "green",
          "desc": "Manage service homes, staffing and assigned clients.",
          "tags": [
            "Company",
            "Homes"
          ]
        },
        {
          "id": "company-settings",
          "label": "Company Chronicles",
          "sub": "Brand, identity and entity configuration",
          "kind": "module",
          "module": "settings",
          "href": "/admin.html#settings",
          "icon": "⚙",
          "tone": "slate",
          "desc": "Manage selected-company branding, identity, address and administrative preferences.",
          "tags": [
            "Company",
            "Settings"
          ]
        },
        {
          "id": "company-documents",
          "label": "Company Documents",
          "sub": "Official records and policies",
          "kind": "route",
          "href": "/company-documents.html",
          "icon": "F",
          "tone": "slate",
          "desc": "Official legal-entity document vault for licenses, policies, insurance, contracts and operations.",
          "tags": [
            "Documents",
            "Company"
          ]
        },
        {
          "id": "company-compliance",
          "label": "Company Compliance",
          "sub": "Licenses, insurance and renewals",
          "kind": "route",
          "href": "/company-compliance.html",
          "icon": "C",
          "tone": "amber",
          "desc": "Licenses, provider credentials, insurance, registrations, contracts, fleet and renewals.",
          "tags": [
            "Compliance",
            "Company"
          ]
        },
        {
          "id": "compliance-evidence",
          "label": "Compliance Evidence",
          "sub": "Verification and supporting records",
          "kind": "route",
          "href": "/compliance-evidence.html",
          "icon": "E",
          "tone": "slate",
          "desc": "Evidence verification and supporting records for company compliance requirements.",
          "tags": [
            "Evidence",
            "Audit"
          ]
        }
      ]
    },
    {
      "id": "people-hr",
      "label": "People & HR",
      "icon": "◉",
      "description": "Recruiting, onboarding, employee records, scheduling, attendance and workforce support.",
      "items": [
        {
          "id": "onboarding",
          "label": "Hiring & Onboarding",
          "sub": "Jobs through employee activation",
          "kind": "module",
          "module": "onboarding",
          "href": "/admin.html#onboarding",
          "icon": "H",
          "tone": "green",
          "desc": "One lifecycle for openings, applicants, screening, interviews, offers, pre-employment and activation.",
          "tags": [
            "Hiring",
            "Onboarding"
          ]
        },
        {
          "id": "employees",
          "label": "Employee 360",
          "sub": "Employee management and records",
          "kind": "module",
          "module": "employees",
          "href": "/admin.html#employees",
          "icon": "360",
          "tone": "violet",
          "desc": "Employee records, permissions, compliance, documents, performance, compensation and leave.",
          "tags": [
            "Employees",
            "HR"
          ]
        },
        {
          "id": "employee-directory",
          "label": "Employee Directory",
          "sub": "People and contact directory",
          "kind": "route",
          "href": "/employee-directory.html",
          "icon": "D",
          "tone": "slate",
          "desc": "Search the Sulandra employee directory and organizational contacts.",
          "tags": [
            "Employees",
            "Directory"
          ]
        },
        {
          "id": "scheduling",
          "label": "Scheduling",
          "sub": "Shifts and service coverage",
          "kind": "route",
          "href": "/scheduling.html",
          "icon": "▦",
          "tone": "slate",
          "desc": "Dedicated staff and service scheduling workspace.",
          "tags": [
            "Scheduling",
            "Operations"
          ]
        },
        {
          "id": "time",
          "label": "Time & Attendance",
          "sub": "Clock-ins and corrections",
          "kind": "route",
          "href": "/time-attendance.html#admin",
          "icon": "◷",
          "tone": "slate",
          "desc": "Clock activity, corrections, geofence operations and payroll-period controls.",
          "tags": [
            "Time",
            "Attendance"
          ]
        },
        {
          "id": "payroll",
          "label": "Payroll",
          "sub": "Payroll administration",
          "kind": "route",
          "href": "/payroll.html",
          "icon": "$",
          "tone": "green",
          "desc": "Payroll workspace and pay-period administration.",
          "tags": [
            "Payroll",
            "Finance"
          ]
        },
        {
          "id": "benefits",
          "label": "Benefits",
          "sub": "Benefits administration",
          "kind": "route",
          "href": "/benefits.html",
          "icon": "B",
          "tone": "green",
          "desc": "Employee benefits information and administration.",
          "tags": [
            "Benefits",
            "Employees"
          ]
        },
        {
          "id": "health-safety",
          "label": "Employee Health & Safety",
          "sub": "Workforce safety records",
          "kind": "route",
          "href": "/health-safety.html",
          "icon": "+",
          "tone": "red",
          "desc": "Employee health, safety and occupational compliance workspace.",
          "tags": [
            "Safety",
            "Employees"
          ]
        }
      ]
    },
    {
      "id": "clients-spire",
      "label": "Clients & SPIRE",
      "icon": "✚",
      "description": "Client intake and the separate SPIRE clinical record application.",
      "items": [
        {
          "id": "client-intake",
          "label": "Client Intake",
          "sub": "Admission packet and approval",
          "kind": "route",
          "href": "/client-intake.html",
          "icon": "+",
          "tone": "violet",
          "desc": "Long-form admission workspace and approved promotion into the shared SPIRE chart.",
          "tags": [
            "Intake",
            "Admission"
          ]
        },
        {
          "id": "spire-admin",
          "label": "SPIRE Administration",
          "sub": "Clinical administration launchpad",
          "kind": "route",
          "href": "/spire-admin.html",
          "icon": "S",
          "tone": "violet",
          "desc": "Administrative launchpad for clinical and client-record operations.",
          "tags": [
            "SPIRE",
            "Clinical"
          ]
        },
        {
          "id": "spire-live",
          "label": "Live SPIRE",
          "sub": "Authorized client charts",
          "kind": "route",
          "href": "/spire/master.html",
          "icon": "✚",
          "tone": "red",
          "desc": "Authorized charts, notes, orders, eMAR, care plans, assessments, flowsheets and incidents.",
          "tags": [
            "Clinical",
            "Charts"
          ]
        },
        {
          "id": "med-quals",
          "label": "Medication Qualifications",
          "sub": "Administration authority",
          "kind": "route",
          "href": "/spire-medication-qualifications.html",
          "icon": "Rx",
          "tone": "amber",
          "desc": "Verify, suspend, revoke and audit medication-administration authority.",
          "tags": [
            "Medication",
            "Safety"
          ]
        },
        {
          "id": "admission-history",
          "label": "Admission History",
          "sub": "Clinical admission trail",
          "kind": "route",
          "href": "/spire-admission-history.html",
          "icon": "A",
          "tone": "slate",
          "desc": "Review clinical admission history and related records.",
          "tags": [
            "Admission",
            "Clinical"
          ]
        },
        {
          "id": "incident-compliance",
          "label": "Incident Compliance",
          "sub": "Incident review and regulatory follow-up",
          "kind": "route",
          "href": "/spire-incident-compliance.html",
          "icon": "!",
          "tone": "red",
          "desc": "Incident compliance review, follow-up and audit workflow.",
          "tags": [
            "Incidents",
            "Compliance"
          ]
        },
        {
          "id": "training",
          "label": "SPIRE Training",
          "sub": "Isolated practice charts",
          "kind": "route",
          "href": "/spire-training.html",
          "icon": "T",
          "tone": "green",
          "desc": "Practice with isolated simulated records separated from production.",
          "tags": [
            "Training",
            "SPIRE"
          ]
        }
      ]
    },
    {
      "id": "service-operations",
      "label": "Service Operations",
      "icon": "▦",
      "description": "Shared workforce operations and selected-company service workspaces.",
      "items": [
        {
          "id": "workforce-admin",
          "label": "Workforce Administration",
          "sub": "Timesheets and employee documents",
          "kind": "route",
          "href": "/workforce-admin.html",
          "icon": "W",
          "tone": "green",
          "desc": "Review timesheets, payroll readiness, employee documents and approvals.",
          "tags": [
            "Workforce",
            "Operations"
          ]
        },
        {
          "id": "service-requests",
          "label": "Service Requests",
          "sub": "Incoming operational requests",
          "kind": "module",
          "module": "service-requests",
          "href": "/admin.html#service-requests",
          "icon": "R",
          "tone": "violet",
          "desc": "Review incoming client service requests outside the hiring lifecycle.",
          "tags": [
            "Requests",
            "Operations"
          ]
        },
        {
          "id": "scls-residential",
          "label": "SCLS Residential",
          "sub": "Homes, residents and handoffs",
          "kind": "route",
          "href": "/scls-residential.html",
          "companyCodes": [
            "SCLS"
          ],
          "entity": "SCLS",
          "icon": "⌂",
          "tone": "green",
          "desc": "Residential operations, staffing, medication windows, appointments and house logs.",
          "tags": [
            "SCLS",
            "Residential"
          ]
        },
        {
          "id": "scls-tasks",
          "label": "SCLS Task Board",
          "sub": "Resident and house work",
          "kind": "route",
          "href": "/scls-tasks.html",
          "companyCodes": [
            "SCLS"
          ],
          "entity": "SCLS",
          "icon": "✓",
          "tone": "green",
          "desc": "Create, assign, execute and audit resident and house tasks.",
          "tags": [
            "SCLS",
            "Tasks"
          ]
        },
        {
          "id": "scls-shift",
          "label": "SCLS My Shift",
          "sub": "Assigned bedside work",
          "kind": "route",
          "href": "/spire-shift.html",
          "companyCodes": [
            "SCLS"
          ],
          "entity": "SCLS",
          "icon": "⇥",
          "tone": "red",
          "desc": "Assigned clients, medication windows, vitals, assessments and flags.",
          "tags": [
            "SCLS",
            "Shift"
          ]
        },
        {
          "id": "hh-referrals",
          "label": "Home Health Referrals",
          "sub": "Secure referral inbox",
          "kind": "route",
          "href": "/home-health-referrals.html",
          "companyCodes": [
            "HOME_HEALTH"
          ],
          "entity": "HOME_HEALTH",
          "icon": "↗",
          "tone": "green",
          "desc": "Referral sources, incoming referrals, matching and Client Intake creation.",
          "tags": [
            "Home Health",
            "Referrals"
          ]
        },
        {
          "id": "hh-soc",
          "label": "Home Health Start of Care",
          "sub": "Accepted referral to episode",
          "kind": "route",
          "href": "/home-health-start-of-care.html",
          "companyCodes": [
            "HOME_HEALTH"
          ],
          "entity": "HOME_HEALTH",
          "icon": "SOC",
          "tone": "red",
          "desc": "Move approved referrals through episode readiness and Start of Care.",
          "tags": [
            "Home Health",
            "SOC"
          ]
        },
        {
          "id": "hh-operations",
          "label": "Home Health Operations",
          "sub": "Episodes and certification periods",
          "kind": "route",
          "href": "/home-health.html",
          "companyCodes": [
            "HOME_HEALTH"
          ],
          "entity": "HOME_HEALTH",
          "icon": "HH",
          "tone": "green",
          "desc": "Episodes, certification periods, Plan of Care, disciplines and visits.",
          "tags": [
            "Home Health",
            "Operations"
          ]
        },
        {
          "id": "hh-visits",
          "label": "Home Health Visits",
          "sub": "Skilled visit documentation",
          "kind": "route",
          "href": "/home-health-visits.html",
          "companyCodes": [
            "HOME_HEALTH"
          ],
          "entity": "HOME_HEALTH",
          "icon": "V",
          "tone": "violet",
          "desc": "Assigned skilled visits, clinical documentation and signed visit records.",
          "tags": [
            "Home Health",
            "Visits"
          ]
        },
        {
          "id": "hh-sources",
          "label": "Home Health Referral Sources",
          "sub": "Source relationships and access",
          "kind": "route",
          "href": "/home-health-sources.html",
          "companyCodes": [
            "HOME_HEALTH"
          ],
          "entity": "HOME_HEALTH",
          "icon": "S",
          "tone": "slate",
          "desc": "Manage referral-source relationships and access.",
          "tags": [
            "Home Health",
            "Sources"
          ]
        },
        {
          "id": "nmt-facilities",
          "label": "NMT Facilities",
          "sub": "Facility relationships",
          "kind": "route",
          "href": "/nmt-facilities.html",
          "companyCodes": [
            "NMT"
          ],
          "entity": "NMT",
          "icon": "F",
          "tone": "green",
          "desc": "Manage hospital and facility referral relationships.",
          "tags": [
            "NMT",
            "Facilities"
          ]
        },
        {
          "id": "nmt-invitations",
          "label": "NMT Facility Invitations",
          "sub": "Secure referral invitations",
          "kind": "route",
          "href": "/nmt-facility-invitations.html",
          "companyCodes": [
            "NMT"
          ],
          "entity": "NMT",
          "icon": "✉",
          "tone": "violet",
          "desc": "Issue and manage secure facility portal invitations.",
          "tags": [
            "NMT",
            "Invitations"
          ]
        },
        {
          "id": "nmt-orders",
          "label": "NMT Orders",
          "sub": "Transportation referrals",
          "kind": "route",
          "href": "/nmt-orders.html",
          "companyCodes": [
            "NMT"
          ],
          "entity": "NMT",
          "icon": "O",
          "tone": "amber",
          "desc": "Review transport referrals, link riders and create intake when needed.",
          "tags": [
            "NMT",
            "Orders"
          ]
        },
        {
          "id": "nmt-dispatch",
          "label": "NMT Dispatch",
          "sub": "Trips, drivers and vehicles",
          "kind": "route",
          "href": "/nmt-dispatch.html",
          "companyCodes": [
            "NMT"
          ],
          "entity": "NMT",
          "icon": "D",
          "tone": "green",
          "desc": "Schedule orders, assign drivers and vehicles and monitor trip progress.",
          "tags": [
            "NMT",
            "Dispatch"
          ]
        }
      ]
    },
    {
      "id": "billing-revenue",
      "label": "Billing & Revenue",
      "icon": "$",
      "description": "Billing readiness, claims, payer exchange and program rules.",
      "items": [
        {
          "id": "revenue",
          "label": "Revenue Cycle",
          "sub": "Billing readiness and holds",
          "kind": "route",
          "href": "/revenue-cycle.html",
          "icon": "$",
          "tone": "green",
          "desc": "Service-event billing readiness, review queues, holds and revenue controls.",
          "tags": [
            "Revenue",
            "Billing"
          ]
        },
        {
          "id": "claim-exchange",
          "label": "Revenue Claim Exchange",
          "sub": "Claim preparation and exchange",
          "kind": "route",
          "href": "/revenue-claim-exchange.html",
          "icon": "⇄",
          "tone": "violet",
          "desc": "Claim-exchange preparation, review and reconciliation.",
          "tags": [
            "Claims",
            "Revenue"
          ]
        },
        {
          "id": "dodd-billing",
          "label": "DODD Billing Rules",
          "sub": "Ohio waiver billing controls",
          "kind": "route",
          "href": "/dodd-billing-rules.html",
          "companyCodes": [
            "SCLS"
          ],
          "entity": "SCLS",
          "icon": "OH",
          "tone": "amber",
          "desc": "Ohio DODD waiver billing-rule validation and readiness.",
          "tags": [
            "DODD",
            "Billing"
          ]
        }
      ]
    },
    {
      "id": "compliance-quality",
      "label": "Compliance & Quality",
      "icon": "✓",
      "description": "Readiness, screening, quality, security, EVV and audit oversight.",
      "items": [
        {
          "id": "readiness",
          "label": "Platform Readiness",
          "sub": "Operational launch gates",
          "kind": "route",
          "href": "/platform-readiness.html",
          "icon": "R",
          "tone": "green",
          "desc": "Legal-entity, compliance, operational, security, quality and revenue readiness checks.",
          "tags": [
            "Readiness",
            "Governance"
          ]
        },
        {
          "id": "analytics",
          "label": "Enterprise Analytics",
          "sub": "Cross-company operating metrics",
          "kind": "route",
          "href": "/enterprise-analytics.html",
          "icon": "⌁",
          "tone": "violet",
          "desc": "Cross-company metrics for clients, workforce, clinical services and revenue.",
          "tags": [
            "Analytics",
            "Metrics"
          ]
        },
        {
          "id": "data-quality",
          "label": "Data Quality",
          "sub": "Findings and resolution",
          "kind": "route",
          "href": "/data-quality.html",
          "icon": "Q",
          "tone": "amber",
          "desc": "Cross-module findings, assignment, acknowledgement and resolution.",
          "tags": [
            "Quality",
            "Audit"
          ]
        },
        {
          "id": "security",
          "label": "Security Audit",
          "sub": "Access governance",
          "kind": "route",
          "href": "/security-audit.html",
          "icon": "⌾",
          "tone": "red",
          "desc": "Access-review campaigns, security oversight and governance controls.",
          "tags": [
            "Security",
            "Audit"
          ]
        },
        {
          "id": "ohio-screening",
          "label": "Ohio Employee Screening",
          "sub": "Background and exclusion checks",
          "kind": "route",
          "href": "/employee-ohio-screening.html",
          "icon": "OH",
          "tone": "amber",
          "desc": "Ohio employee screening cases, evidence and review.",
          "tags": [
            "Screening",
            "Ohio"
          ]
        },
        {
          "id": "evv-operations",
          "label": "EVV Operations",
          "sub": "EVV validation and exception review",
          "kind": "route",
          "href": "/spire-evv-test-console.html",
          "icon": "EVV",
          "tone": "red",
          "desc": "EVV operational validation, exceptions and certification testing.",
          "tags": [
            "EVV",
            "Compliance"
          ]
        },
        {
          "id": "reports",
          "label": "Audit & Reports",
          "sub": "Employee and platform audit",
          "kind": "route",
          "href": "/employee360.html#audit",
          "icon": "A",
          "tone": "slate",
          "desc": "Audit and reporting workspace.",
          "tags": [
            "Audit",
            "Reports"
          ]
        }
      ]
    },
    {
      "id": "communications-learning",
      "label": "Communications & Learning",
      "icon": "✦",
      "description": "Intranet publishing, employee communications, policies and education.",
      "items": [
        {
          "id": "intranet-control",
          "label": "Intranet Content Control",
          "sub": "Announcements, images and timing",
          "kind": "route",
          "href": "/intranet-control.html",
          "icon": "I",
          "tone": "violet",
          "desc": "Manage intranet hero content, announcements, news, images and timing.",
          "tags": [
            "Intranet",
            "Content"
          ]
        },
        {
          "id": "intranet",
          "label": "Company Intranet",
          "sub": "Live employee information",
          "kind": "route",
          "href": "/intranet.html",
          "icon": "⌂",
          "tone": "slate",
          "desc": "Open the live employee intranet and internal resources.",
          "tags": [
            "Intranet",
            "Employees"
          ]
        },
        {
          "id": "learning",
          "label": "Learning Center",
          "sub": "Courses and assignments",
          "kind": "route",
          "href": "/education-portal.html",
          "icon": "L",
          "tone": "violet",
          "desc": "Assigned courses, renewals, training history, assessments and certificates.",
          "tags": [
            "Learning",
            "Education"
          ]
        },
        {
          "id": "policies",
          "label": "Policies",
          "sub": "Company policies and acknowledgements",
          "kind": "route",
          "href": "/policies.html",
          "icon": "P",
          "tone": "slate",
          "desc": "Company policies and employee-facing policy information.",
          "tags": [
            "Policies",
            "Compliance"
          ]
        },
        {
          "id": "news",
          "label": "News & Announcements",
          "sub": "Internal communications",
          "kind": "route",
          "href": "/news.html",
          "icon": "N",
          "tone": "violet",
          "desc": "Internal news and company announcements.",
          "tags": [
            "News",
            "Communications"
          ]
        },
        {
          "id": "support",
          "label": "Support",
          "sub": "Employee and platform help",
          "kind": "route",
          "href": "/support.html",
          "icon": "?",
          "tone": "slate",
          "desc": "Support resources and service assistance.",
          "tags": [
            "Support",
            "Help"
          ]
        }
      ]
    },
    {
      "id": "system-administration",
      "label": "System Administration",
      "icon": "⚙",
      "description": "Users, roles, enterprise applications and administrator profile.",
      "items": [
        {
          "id": "enterprise-apps",
          "label": "Enterprise Apps",
          "sub": "Search all authorized systems",
          "kind": "route",
          "href": "/enterprise-apps.html",
          "icon": "A",
          "tone": "violet",
          "desc": "Search and launch all authorized Sulandra applications.",
          "tags": [
            "Apps",
            "Platform"
          ]
        },
        {
          "id": "admin-users",
          "label": "Users & Access",
          "sub": "Administrator user management",
          "kind": "route",
          "href": "/admin-users.html",
          "icon": "U",
          "tone": "red",
          "desc": "Administrator user and access management.",
          "tags": [
            "Users",
            "Access"
          ]
        },
        {
          "id": "role-workspaces",
          "label": "Roles & Workspaces",
          "sub": "Role navigation and assignments",
          "kind": "route",
          "href": "/role-workspaces.html",
          "icon": "R",
          "tone": "slate",
          "desc": "Role-specific workspace access and navigation.",
          "tags": [
            "Roles",
            "Permissions"
          ]
        },
        {
          "id": "admin-profile",
          "label": "Administrator Profile",
          "sub": "Enterprise-owner account",
          "kind": "route",
          "href": "/admin-profile.html",
          "icon": "P",
          "tone": "slate",
          "desc": "Administrator and Enterprise Owner profile controls.",
          "tags": [
            "Profile",
            "Admin"
          ]
        }
      ]
    }
  ],
  "topNav": [
    {
      "key": "dashboard",
      "label": "Dashboard",
      "sub": "Command Center",
      "kind": "module",
      "module": "dashboard",
      "href": "/admin.html#dashboard"
    },
    {
      "key": "my-work",
      "label": "My Work",
      "sub": "Assigned work",
      "kind": "route",
      "href": "/my-work.html"
    },
    {
      "key": "notifications",
      "label": "Notifications",
      "sub": "Urgent and due work",
      "kind": "route",
      "href": "/notifications.html"
    }
  ],
  "lifecycle": [
    {
      "id": "overview",
      "label": "Overview",
      "statuses": []
    },
    {
      "id": "openings",
      "label": "Job Openings",
      "panel": "openings",
      "statuses": []
    },
    {
      "id": "applications",
      "label": "New Applicants",
      "panel": "applicants",
      "statuses": [
        "RECEIVED"
      ]
    },
    {
      "id": "screening",
      "label": "Review & Screening",
      "panel": "applicants",
      "statuses": [
        "REVIEWING",
        "DOCUMENTS_NEEDED"
      ]
    },
    {
      "id": "interviews",
      "label": "Interviews",
      "panel": "applicants",
      "statuses": [
        "INTERVIEW"
      ]
    },
    {
      "id": "offers",
      "label": "Offers",
      "panel": "applicants",
      "statuses": [
        "OFFER_PENDING",
        "OFFER_ACCEPTED"
      ]
    },
    {
      "id": "prehire",
      "label": "Pre-employment",
      "panel": "applicants",
      "statuses": [
        "HIRE"
      ]
    },
    {
      "id": "activation",
      "label": "Activation & Orientation",
      "panel": "applicants",
      "statuses": [
        "HIRED"
      ]
    },
    {
      "id": "archive",
      "label": "Archive",
      "panel": "archived",
      "statuses": [
        "ARCHIVED",
        "POSITION_FILLED",
        "NOT_SELECTED",
        "WITHDRAWN",
        "TERMINATED"
      ]
    }
  ]
};
  const clone = value => JSON.parse(JSON.stringify(value));
  const allItems = data.folders.flatMap(folder => folder.items.map(item => ({...item, folderId:folder.id, group:folder.label})));
  const categoryFor = folderId => ({
    'company-management':'governance',
    'people-hr':'people',
    'clients-spire':'clinical',
    'service-operations':'operations',
    'billing-revenue':'governance',
    'compliance-quality':'governance',
    'communications-learning':'operations',
    'system-administration':'operations',
  })[folderId] || 'operations';
  const legacyItem = item => ({
    key:item.module || item.id,
    label:item.label,
    sub:item.sub || '',
    kind:item.kind,
    ...(item.kind === 'route' ? {href:item.href} : {}),
    ...(item.companyCodes ? {companyCodes:[...item.companyCodes]} : {}),
  });
  const legacyNavigation = Object.freeze({
    primary:Object.freeze(data.topNav.map(legacyItem)),
    leftOnly:Object.freeze(allItems.map(legacyItem)),
    portals:Object.freeze([
      {label:'Intranet Portal',sub:'Live company intranet',href:'/intranet.html'},
      {label:'Employee Portal',sub:'Employee-facing workspace',href:'/employee-portal.html'},
      {label:'Employee 360',sub:'Employee records and management',href:'/employee360.html'},
      {label:'Education Portal',sub:'Training, courses and assignments',href:'/education-portal.html'},
      {label:'SPIRE Clinical',sub:'Separate clinical and client-record application',href:'/spire.html'},
    ]),
    quickOperations:Object.freeze([
      {label:'Scheduling',sub:'Workforce schedules by service location',href:'/scheduling.html'},
      {label:'Time & Attendance',sub:'Clock-ins, corrections and payroll-period review',href:'/time-attendance.html#admin'},
    ]),
  });
  const enterpriseApps = Object.freeze(allItems.map(item => ({
    id:item.id,
    group:item.group,
    cat:item.entity ? 'company' : categoryFor(item.folderId),
    ...(item.entity ? {entity:item.entity} : {}),
    title:item.label,
    href:item.href,
    icon:item.icon || '•',
    tone:item.tone || 'slate',
    desc:item.desc || item.sub || '',
    tags:Array.isArray(item.tags) ? [...item.tags] : [],
  })));
  const registry = Object.freeze({
    version:data.version,
    folders:Object.freeze(clone(data.folders)),
    topNav:Object.freeze(clone(data.topNav)),
    onboardingLifecycle:Object.freeze(clone(data.lifecycle)),
    allItems:Object.freeze(clone(allItems)),
    legacyNavigation,
    enterpriseApps,
    itemById(id){ return this.allItems.find(item => item.id === id) || null; },
    folderById(id){ return this.folders.find(folder => folder.id === id) || null; },
  });
  window.SulandraAdminRouteRegistry = registry;
  document.documentElement.dataset.sulandraAdminRegistry = registry.version;
})();
