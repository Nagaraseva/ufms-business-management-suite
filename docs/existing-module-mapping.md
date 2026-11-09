<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Existing Module Mapping

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Source-to-product module map

Every source file has been assigned to one or more product modules from Part 4 (A–R) of the
master instruction. Files appearing in more than one row are shared concerns (they serve
several modules and will be split).

| Product module (Part 4) | Source file(s) | LOC |
|---|---|---|
| Platform Administration | `Companies.gs`<br>`Database.gs`<br>`Setup.gs`<br>`Theme.gs` | 1,845 |
| Organisation Management | `Companies.gs`<br>`Setup.gs` | 532 |
| User & Access Management | `AuthAndApi.gs`<br>`Database.gs`<br>`ProfileAndBulkEmail.gs` | 3,058 |
| Sales CRM | `LeadsAndSurveys.gs`<br>`ProfileAndBulkEmail.gs` | 1,620 |
| Site Survey | `LeadsAndSurveys.gs` | 1,213 |
| Quotations | `Quotations.gs`<br>`TakeHomeSalary.gs` | 3,267 |
| Tender Management | `Companies.gs`<br>`TenderAI.gs`<br>`TenderOrdersAndSD.gs`<br>`Tenders.gs` | 7,603 |
| Client & Contract Management | `ClientCare.gs`<br>`Clients.gs`<br>`WonHandover.gs` | 2,811 |
| HR Management | `HR.gs`<br>`ManpowerHeroes.gs` | 1,754 |
| Manpower & Operations | `HR.gs`<br>`ManpowerHeroes.gs`<br>`MinimumWages.gs` | 6,146 |
| Payroll & Statutory Compliance | `HR.gs`<br>`MinimumWages.gs`<br>`TakeHomeSalary.gs` | 7,336 |
| Accounts & Finance | `Accounts.gs`<br>`BulkImport.gs` | 1,815 |
| Assets & Inventory | `Assets.gs` | 2,712 |
| Reports & Dashboards | `DailyReports.gs`<br>`Exports.gs`<br>`Moms.gs`<br>`Reports.gs` | 3,643 |
| SLA & Client Care | `ClientCare.gs`<br>`ServiceLevelAgreements.gs` | 2,531 |
| Marketing & Communication | `EmailDirectory.gs`<br>`EmailMarketing.gs`<br>`EmailTemplates.gs`<br>`GmailDownloader.gs`<br>`Marketing.gs`<br>`MarketingTemplates.gs`<br>`SocialMedia.gs` | 7,209 |
| AI Assistant | `CrmAssistant.gs`<br>`TenderAI.gs` | 7,351 |
| Creative Studio & Templates | `CreativeStudio.gs`<br>`Logo.gs`<br>`Presentation.gs`<br>`PresentationImages.gs`<br>`ProposalTemplates.gs`<br>`ServiceTemplateImages.gs` | 1,590 |
| Collaboration | `Collaboration.gs`<br>`Moms.gs` | 1,806 |
| Document Generation | `Exports.gs`<br>`ManualDrive.gs`<br>`Presentation.gs`<br>`ProposalTemplates.gs`<br>`ServiceLevelAgreements.gs` | 2,930 |

## 2. Coverage verdict per instruction section

| § | Module | Present in source? | Notes |
|---|---|---|---|
| A | Platform Administration | ❌ **ABSENT as a concept** | There is a single-tenant "Super Admin" *user role* and a Settings sheet, but no tenant entity, no plans, no subscriptions, no usage metering, no domain management, no platform audit separation. This is **new build**, not migration. |
| B | Organisation Management | ⚠️ **Partial** | `Companies.gs` + `UserCompanyAccess` give a flat list of tendering companies. There is no branch, department, site hierarchy or reporting line. Branches/sites/departments are **new**; companies migrate. |
| C | User & Access Management | ✅ **Present** | PIN-based login, sessions, roles, per-user read access. No MFA, no password reset by token, no login-history UI beyond the `LoginHistory` sheet. |
| D | Sales CRM | ✅ **Present** | `LeadsAndSurveys.gs` — leads, follow-ups, assignment, source, status, conversion, export. |
| E | Site Survey | ✅ **Present** | Survey scheduling, inspection capture, photos, manpower requirements, survey→quotation. |
| F | Quotations | ✅ **Present — complex** | Numbering, revisions, line items, wage breakup costing, management fee, tax, PDF, approval, won/lost. See business rules doc. |
| G | Tender Management | ✅ **Present — largest domain** | Independent `TenderID` already exists (NOT dependent on LeadID) — the Part 4 requirement is already satisfied by the source and must be preserved. Plus AI tender analysis (`TenderAI.gs`). |
| H | Client & Contract Management | ✅ **Present** | `Clients.gs`, `ClientCare.gs` (renewals, complaints), `WonHandover.gs` (mobilisation handover). |
| I | HR Management | ✅ **Present** | `HR.gs` — employees, documents, salary slips, ESI/PF registers. |
| J | Manpower & Operations | ⚠️ **Partial** | Employee→site allocation exists. Attendance, leave, shifts, OT tracking and vacancy/replacement workflows are thin or absent; these are largely **new build**. |
| K | Payroll & Statutory Compliance | ⚠️ **Present but unsafe** | Calculations exist (`TakeHomeSalary.gs`, `MinimumWages.gs`) but statutory rates are literals, there is no effective-dating, no maker-checker and no period locking. **Must be rebuilt, not ported.** |
| L | Accounts & Finance | ✅ **Present** | `Accounts.gs` — invoices, payments, vendor bills, bank book, journal, working sheets. Not a GST filing system and the new product will not claim to be. |
| M | Assets & Inventory | ✅ **Present** | `Assets.gs` — assets, stock items, purchases, distributions, vendors, POs, indents, maintenance. |
| N | Reports & Dashboards | ✅ **Present** | `Reports.gs`, `DailyReports.gs`, `Exports.gs`. All are spreadsheet/HTML exports. |
| O | SLA & Client Care | ✅ **Present** | `ServiceLevelAgreements.gs` (SLA generation), `ClientCare.gs` (complaints register). |
| P | Marketing & Communication | ✅ **Present — very large** | Email marketing, social publishing, creative studio, email directory, Gmail downloader. External provider OAuth. |
| Q | AI Assistant | ✅ **Present** | `CrmAssistant.gs` ("Ask your CRM"), `TenderAI.gs`, plus AI in social/creative/email modules. Multi-provider (Groq, OpenAI, Gemini, DeepSeek, OpenRouter, Z.ai). |
| R | Creative Studio & Templates | ✅ **Present** | `CreativeStudio.gs`, `Presentation.gs`, `ProposalTemplates.gs`, `MarketingTemplates.gs`, `Logo.gs`. |
| + | **Collaboration (not in Part 4)** | ✅ **Present** | `Collaboration.gs` (user notes, chat) and `Moms.gs` (Minutes of Meeting with action items). **Part 4 says preserve every additional module found — these are added to scope.** |
| + | **Meeting Minutes (MOM)** | ✅ **Present** | `Moms.gs` — 8 sheets: meetings, participants, agenda, decisions, action items, attachments, templates. New module beyond the Part 4 list. |

## 3. Navigation inventory (NaN pages)

| Page id | Label |
|---|---|
| dashboard | Dashboard |
| leads | Leads |
| surveys | Surveys |
| quotations | Quotations |
| clients | Clients |
| bulkEmail | Bulk Email |
| tenderDashboard | Tender Dashboard |
| tenders | New Tenders |
| aiTenders | AI Tender Analysis |
| sdTracker | SD Tracker |
| tenderOrders | Tender Order |
| salaryBreakup | Wage Breakup |
| minimumWages | Minimum Wages |
| takeHomeSalary | Take Home Salary |
| wageRevision | Wage Revision |
| accountsOverview | Overview |
| accountsInvoices | Customer Invoices |
| accountsReceipts | Customer Receipts |
| accountsBills | Vendor Bills |
| accountsPayments | Vendor Payments |
| accountsBankBook | Bank & Cash Book |
| accountsReports | Reports |
| assets | Assets |
| stockItems | Stock Items |
| stockDistributions | Stock Distribution |
| vendors | Vendors |
| purchaseOrders | Purchase Orders |
| indents | Indents |
| purchaseRequestsAdmin | Purchase Requests |
| stockReports | Stock Reports |
| paymentStatus | Payment Status |
| employees | Employees |
| salarySlips | Salary Slips |
| payrollRuns | Payroll Runs |
| esiRegister | ESI Register |
| pfRegister | PF Register |
| users | Users |
| settings | Settings |
| dailyReport | Daily Report |
| reports | Sales Report |
| tenderReports | Tender Report |
| theme | Theme & Appearance |
| studioDashboard | AI Creative Studio |
| creativeLibrary | Creative Library |
| socialDashboard | Social Dashboard |
| socialCreate | Create Post |
| socialCalendar | Content Calendar |
| socialDrafts | Drafts |
| socialScheduled | Scheduled |
| socialPublished | Published |
| socialAccounts | Social Accounts |
| socialTemplates | Post Templates |
| socialMedia | Media Library |
| socialAnalytics | Social Analytics |
| marketingContacts | Email Contacts |
| marketingMailboxes | Mailbox Connections |
| marketingSync | Email Sync |
| marketingSegments | Segments |
| marketingSuppression | Suppression / Opt-Out |
| marketingHistory | Sync History |
| marketingSettings | Marketing Settings |
| emailMktDashboard | Dashboard |
| emailMktCampaigns | Campaigns |
| emailMktCreate | Create Campaign |
| emailMktBuilder | Email Builder |
| emailMktTemplates | Templates |
| emailMktAi | AI Email Creator |
| emailMktContacts | Contacts |
| emailMktLists | Contact Lists |
| emailMktSegments | Segments |
| emailMktAccounts | Email Accounts |
| emailMktScheduled | Scheduled Emails |
| emailMktAnalytics | Analytics |
| emailMktUnsubscribed | Unsubscribed |
| emailMktSettings | Settings |
| momDashboard | MOM Dashboard |
| moms | All MOMs |
| momActions | Action Items |
| momMyActions | My Action Items |
| momOverdue | Overdue Actions |
| momCreate | Create MOM |
| momTemplates | MOM Templates |
| momSettings | MOM Settings |
| marketingLeads | Marketing Leads |

## 4. Screens / dialogs (185 render functions)

`showLoader`, `showLogin`, `openMobileMenu`, `renderMomDashboard`, `renderMomsAll`, `openMom`, `renderMomCreate`, `renderMomActions`, `renderMomMyActions`, `renderMomOverdue`, `renderMomTemplates`, `renderMomSettings`, `openNotes`, `renderNotes`, `openChat`, `renderChatMessages`, `showReminders`, `renderDashboard`, `renderBdmDashboard`, `renderSuperAdminDashboard`, `renderBackOfficeDashboard`, `renderPayrollDashboard`, `renderAccountsDashboard`, `renderManagementDashboard`, `renderManagementApprovalsHtml`, `renderMarketingLeads`, `openMarketingLeadForm`, `renderLeads`, `openModal`, `openJobCallEmail`, `openLeadForm`, `showLead`, `renderSurveys`, `openSurvey`, `renderQuotes`, `openQuoteEditor`, `renderSalaryBreakup`, `openSavedBreakup`, `showQuote`, `openTenderPaymentDialog`, `openTenderOrderPaymentDialog`, `openTenderOrderAMCPaymentDialog`, `openMarkTenderPaymentPaidDialog`, `openWonHandoverEditor`, `renderWageRevision`, `renderClients`, `openClientForm`, `showClient`, `renderEmployees`, `renderEmployeeRows`, `openEmployeeForm`, `showEmployee`, `renderSalarySlips`, `renderSalarySlipRows`, `openSalarySlipForm`, `showSalarySlip`, `openEmailSlipDialog`, `openBulkGenerateForm`, `renderEsiRegister`, `openCreateEsiRegisterForm`, `showEsiRegister`, `openRecordEsiFilingForm`, `renderPfRegister`, `openCreatePfRegisterForm`, `showPfRegister`, `openRecordPfFilingForm`, `renderAssets`, `showAsset`, `openAssignAssetForm`, `openSaveAssetForm`, `openAssetModal`, `renderStockItems`, `showStockItem`, `openSaveStockItemForm`, `openStockItemModal`, `renderStockDistributions`, `showStockDistribution`, `openSaveStockDistributionForm`, `renderVendors`, `showVendor`, `openSaveVendorForm`, `openVendorModal`, `renderPurchaseOrders`, `showPurchaseOrder`, `openSavePurchaseOrderForm`, `openPurchaseOrderModal`, `openReceivePo`, `openCreatePoForItem`, `openCreatePoForVendor`, `openCreatePoFromLowStock`, `renderIndents`, `showIndent`, `openSaveIndentForm`, `openIndentModal`, `renderPurchaseRequestsAdmin`, `showPurchaseRequestAdmin`, `openSavePRForm`, `openPRModal`, `renderStockReports`, `renderPaymentStatus`, `openUpdatePaymentForm`, `renderAccountsOverview`, `renderAccountsInvoices`, `renderAccountsReceipts`, `renderAccountsBills`, `renderAccountsPayments`, `renderAccountsBankBook`, `renderAccountsReports`, `openInvoiceEditor`, `openRecordReceipt`, `showInvoice`, `openBillEditor`, `showBill`, `openRecordVendorPayment`, `openBankAccountEditor`, `renderPayrollRuns`, `openCreatePayrollRunForm`, `showPayrollRun`, `renderTenderDashboard`, `renderTenders`, `renderTenderFolderCard`, `openTenderForm`, `showTender`, `renderTenderOrders`, `showTenderOrder`, `renderSDTracker`, `openSDEntryForm`, `showSDEntry`, `renderTenderReports`, `renderReports`, `renderUsers`, `openEmailPreviewModal`, `renderBulkEmail`, `openMarketingSettingsPage`, `renderMarketingContacts`, `renderMarketingMailboxes`, `renderMarketingSync`, `renderMarketingSegments`, `renderMarketingSuppression`, `renderMarketingHistory`, `renderSettings`, `renderBulkImportCard`, `openBulkImportModal`, `showBulkImportPreview`, `showBulkImportCommit`, `renderMarketingTemplateRows`, `openMarketingTemplateForm`, `renderTopAvatar`, `renderDailyReport`, `renderTheme`, `renderExecHome`, `renderAITenders`, `renderAiNewTender`, `showAITender`, `renderMinimumWages`, `renderTakeHomeSalary`, `renderSocialDashboard`, `renderSocialDrafts`, `renderSocialScheduled`, `renderSocialPublished`, `openSocialPost`, `renderSocialCalendar`, `openSocialPlan`, `renderSocialCreate`, `renderSocialAccounts`, `renderSocialTemplates`, `renderSocialMedia`, `renderSocialAnalytics`, `renderEmailMktDashboard`, `renderEmailMktCampaigns`, `openEmailMktCampaign`, `renderEmailMktScheduled`, `renderEmailMktCreate`, `renderEmailMktBuilder`, `renderEmailMktTemplates`, `renderEmailMktAi`, `renderEmailMktContacts`, `renderEmailMktLists`, `renderEmailMktSegments`, `renderEmailMktAccounts`, `renderEmailMktAnalytics`, `renderEmailMktUnsubscribed`, `renderEmailMktSettings`, `renderCreativeStudioDashboard`, `renderCreativeLibrary`

