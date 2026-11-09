<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Existing API and Server Functions

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. The single entry point

The entire backend is reached through one Apps Script function:

```js
// AuthAndApi.gs:177
function api(action, payload, token) {
  if (action === 'login') return { ok: true, data: login_(payload) };
  const user = authenticate_(token);
  ... MANAGEMENT read-only allow-list ...
  switch (action) { case 'x': data = handler_(user, payload); break; ... }
}
```

There is no HTTP router, no resource model, no OpenAPI description and no per-route contract.
Every operation is a case label in a **537-case switch**.

## 2. Surface totals

| Surface | Count | Authentication |
|---|---|---|
| Authenticated actions in `api()` | 537 | session token → `authenticate_(token)` |
| Public email-link actions in `handleEmailLinkAction_` | 6 | **none** — single-use token in URL |
| Unique dispatch labels overall | 542 | — |
| Public `doGet` query parameters (webhooks/tracking/OAuth) | 8 | **none** — provider callbacks & tracking pixels |
| Distinct actions actually invoked by the UI | 373 | — |
| Actions defined but never invoked by the UI | 158 | reachable by API client only — must not be silently dropped |

## 3. Authorisation model as found

Guards are applied ad-hoc inside individual case arms, not by route. Distribution:

| Guard | Actions |
|---|---|
| **none** | 392 |
| `assertTender_` | 64 |
| `assertRole_` | 36 |
| `assertOffice_` | 31 |
| `assertSalesMgmtRead_` | 7 |
| `assertMgmtRead_` | 5 |
| `assertSalesView_` | 2 |

> ### ⚠️ Finding of record
> **392 of 537 actions (NaN%) have no explicit permission guard.**
> They are reachable by *any* user holding a valid session, in any role. The legacy design leans on
> the frontend to hide navigation, which is exactly the pattern Part 1 rule 10 forbids
> ("Do not implement tenant isolation/authorisation only through frontend filtering").
> **Every one of the 537 actions gets an explicit permission code in the new API**; there is no
> "default allow" and a route with no declared permission fails closed at startup.

## 4. Public (unauthenticated) operations

| Action | Auth model | Line |
|---|---|---|
| `approveindent` | none — opaque URL token | 82 |
| `rejectindent` | none — opaque URL token | 83 |
| `approvepurchaserequest` | none — opaque URL token | 84 |
| `rejectpurchaserequest` | none — opaque URL token | 85 |
| `acknowledgedistribution` | none — opaque URL token | 86 |
| `ping` | none — opaque URL token | 87 |

These approve/reject indents and purchase requests and acknowledge stock distributions. They are
business-critical (site staff have no CRM login) so they **are** migrated — but as
signed, expiring, single-use tokens bound to one entity and one action, rate-limited, and written
to the audit log. The legacy version accepts a plain UUID with no expiry check in the URL.

## 5. Complete action inventory (537)

| Action | Permission guard | Allowed roles | Handler function | Source |
|---|---|---|---|---|
| `logout` | **none** | — | `logout_` | AuthAndApi.gs:243 |
| `ping` | **none** | — | `buildVersion_` | AuthAndApi.gs:244 |
| `bootstrap` | **none** | — | `getBootstrapData_` | AuthAndApi.gs:245 |
| `calendarReminders` | **none** | — | `calendarReminders_` | AuthAndApi.gs:249 |
| `getUserNotes` | **none** | — | `getUserNotes_` | AuthAndApi.gs:250 |
| `saveUserNote` | **none** | — | `saveUserNote_` | AuthAndApi.gs:251 |
| `deleteUserNote` | **none** | — | `deleteUserNote_` | AuthAndApi.gs:252 |
| `getThemeState` | **none** | — | `getThemeState_` | AuthAndApi.gs:254 |
| `saveMyThemePref` | **none** | — | `saveMyThemePref_` | AuthAndApi.gs:255 |
| `saveOrgDefault` | `assertRole_` | SUPER_ADMIN | `saveOrgDefault_` | AuthAndApi.gs:256 |
| `saveCustomTheme` | `assertRole_` | SUPER_ADMIN | `saveCustomTheme_` | AuthAndApi.gs:257 |
| `deleteCustomTheme` | `assertRole_` | SUPER_ADMIN | `deleteCustomTheme_` | AuthAndApi.gs:258 |
| `getThemeAudit` | `assertRole_` | SUPER_ADMIN | `getThemeAudit_` | AuthAndApi.gs:259 |
| `getChatMessages` | **none** | — | `getChatMessages_` | AuthAndApi.gs:260 |
| `markChatRead` | **none** | — | `markChatRead_` | AuthAndApi.gs:261 |
| `postChatMessage` | **none** | — | `postChatMessage_` | AuthAndApi.gs:262 |
| `getLead` | `assertSalesMgmtRead_` | (module-scoped) | `getLeadDetails_` | AuthAndApi.gs:263 |
| `createLead` | `assertOffice_` | (module-scoped) | `createLead_` | AuthAndApi.gs:264 |
| `createMarketingLead` | `assertRole_` | EXECUTIVE | `createMarketingLead_` | AuthAndApi.gs:265 |
| `updateLead` | `assertOffice_` | (module-scoped) | `updateLead_` | AuthAndApi.gs:266 |
| `addLeadFollowup` | `assertOffice_` | (module-scoped) | `addLeadFollowup_` | AuthAndApi.gs:267 |
| `addMarketingLeadFollowup` | `assertRole_` | EXECUTIVE | `addLeadFollowup_` | AuthAndApi.gs:268 |
| `exportLeadBucket` | `assertOffice_` | (module-scoped) | `exportLeadBucket_` | AuthAndApi.gs:269 |
| `sendJobCallEmail` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, BDM_MANAGER | `sendJobCallEmail_` | AuthAndApi.gs:270 |
| `exportStructuredData` | **none** | — | `exportStructuredData_` | AuthAndApi.gs:271 |
| `scheduleSurvey` | `assertOffice_` | (module-scoped) | `scheduleSurvey_` | AuthAndApi.gs:272 |
| `cancelSurvey` | `assertOffice_` | (module-scoped) | `cancelSurvey_` | AuthAndApi.gs:273 |
| `downloadManual` | `assertRole_` | ADMIN | `getManualFile_` | AuthAndApi.gs:274 |
| `getSurvey` | `assertSalesMgmtRead_` | (module-scoped) | `getSurveyDetails_` | AuthAndApi.gs:275 |
| `saveSurveyInspection` | `assertSalesView_` | (module-scoped) | `saveSurveyInspection_` | AuthAndApi.gs:276 |
| `uploadSurveyPhoto` | `assertSalesView_` | (module-scoped) | `uploadSurveyPhoto_` | AuthAndApi.gs:277 |
| `surveyFormPdf` | `assertSalesMgmtRead_` | (module-scoped) | `surveyFormPdf_` | AuthAndApi.gs:278 |
| `getQuotation` | `assertSalesMgmtRead_` | (module-scoped) | `getQuotationDetails_` | AuthAndApi.gs:279 |
| `saveQuotation` | `assertOffice_` | (module-scoped) | `saveQuotation_` | AuthAndApi.gs:280 |
| `addQuoteFollowup` | `assertOffice_` | (module-scoped) | `addQuotationFollowup_` | AuthAndApi.gs:281 |
| `generateQuotePdf` | `assertSalesMgmtRead_` | (module-scoped) | `generateQuotationPdf_` | AuthAndApi.gs:282 |
| `generateSalaryBreakupPdf` | `assertMgmtRead_` | (module-scoped) | `generateSalaryBreakupPdf_` | AuthAndApi.gs:283 |
| `saveSalaryBreakup` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, TENDER_USER, BDM_MANAGER | `saveSalaryBreakup_` | AuthAndApi.gs:284 |
| `getSalaryBreakups` | `assertMgmtRead_` | (module-scoped) | `listSalaryBreakups_` | AuthAndApi.gs:285 |
| `getSlaDraft` | **none** | — | `getSlaDraft_` | AuthAndApi.gs:289 |
| `generateSla` | **none** | — | `slaGenerate_` | AuthAndApi.gs:290 |
| `slaRecentActivity` | `assertOffice_` | (module-scoped) | `slaRecent_` | AuthAndApi.gs:291 |
| `getClientSiteHandover` | `assertOffice_` | (module-scoped) | `getClientSiteHandover_` | AuthAndApi.gs:295 |
| `sendClientSiteHandover` | `assertOffice_` | (module-scoped) | `sendClientSiteHandover_` | AuthAndApi.gs:296 |
| `listSavedBreakups` | `assertOffice_` | (module-scoped) | `listSavedBreakupsForPicker_` | AuthAndApi.gs:297 |
| `getSalaryBreakup` | `assertMgmtRead_` | (module-scoped) | `getSalaryBreakup_` | AuthAndApi.gs:298 |
| `attachSavedBreakupToQuotation` | `assertOffice_` | (module-scoped) | `attachSavedBreakupToQuotation_` | AuthAndApi.gs:299 |
| `deleteSalaryBreakup` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, TENDER_USER, BDM_MANAGER | `deleteSalaryBreakup_` | AuthAndApi.gs:300 |
| `setSalaryBreakupSide` | `assertRole_` | SUPER_ADMIN, ADMIN | `setSalaryBreakupSide_` | AuthAndApi.gs:301 |
| `momFormData` | **none** | — | `momFormData_` | AuthAndApi.gs:309 |
| `momSiteOptions` | **none** | — | `momSiteOptions_` | AuthAndApi.gs:310 |
| `momListFor` | **none** | — | `momListFor_` | AuthAndApi.gs:311 |
| `momDashboard` | **none** | — | `momDashboard_` | AuthAndApi.gs:312 |
| `listMoms` | **none** | — | `listMoms_` | AuthAndApi.gs:313 |
| `searchMoms` | **none** | — | `searchMoms_` | AuthAndApi.gs:314 |
| `getMom` | **none** | — | `getMom_` | AuthAndApi.gs:315 |
| `saveMom` | **none** | — | `saveMom_` | AuthAndApi.gs:316 |
| `finalizeMom` | **none** | — | `finalizeMom_` | AuthAndApi.gs:317 |
| `archiveMom` | **none** | — | `archiveMom_` | AuthAndApi.gs:318 |
| `reopenMom` | `assertRole_` | SUPER_ADMIN, ADMIN | `reopenMom_` | AuthAndApi.gs:319 |
| `deleteMom` | `assertRole_` | SUPER_ADMIN | `deleteMom_` | AuthAndApi.gs:320 |
| `duplicateMom` | **none** | — | `duplicateMom_` | AuthAndApi.gs:321 |
| `listMomActions` | **none** | — | `listMomActions_` | AuthAndApi.gs:322 |
| `listMyMomActions` | **none** | — | `listMyMomActions_` | AuthAndApi.gs:323 |
| `getOverdueMomActions` | **none** | — | `getOverdueMomActions_` | AuthAndApi.gs:324 |
| `updateMomActionStatus` | **none** | — | `updateMomActionStatus_` | AuthAndApi.gs:325 |
| `assignMomAction` | **none** | — | `assignMomAction_` | AuthAndApi.gs:326 |
| `createFollowupFromAction` | **none** | — | `createFollowupFromAction_` | AuthAndApi.gs:327 |
| `uploadMomAttachment` | **none** | — | `uploadMomAttachment_` | AuthAndApi.gs:328 |
| `deleteMomAttachment` | **none** | — | `deleteMomAttachment_` | AuthAndApi.gs:329 |
| `listMomTemplates` | **none** | — | `listMomTemplates_` | AuthAndApi.gs:330 |
| `saveMomTemplate` | `assertRole_` | SUPER_ADMIN, ADMIN | `saveMomTemplate_` | AuthAndApi.gs:331 |
| `deleteMomTemplate` | `assertRole_` | SUPER_ADMIN, ADMIN | `deleteMomTemplate_` | AuthAndApi.gs:332 |
| `getMomSettings` | `assertRole_` | SUPER_ADMIN | `assertRole_` | AuthAndApi.gs:333 |
| `saveMomSettings` | `assertRole_` | SUPER_ADMIN | `momSaveSettings_` | AuthAndApi.gs:334 |
| `generateMomPdf` | **none** | — | `generateMomPdf_` | AuthAndApi.gs:335 |
| `emailMom` | **none** | — | `emailMom_` | AuthAndApi.gs:336 |
| `momEmailSuggestions` | **none** | — | `momEmailSuggestions_` | AuthAndApi.gs:337 |
| `setupMomModule` | `assertRole_` | SUPER_ADMIN | `setupMomModule_` | AuthAndApi.gs:338 |
| `exportSalaryBreakupExcel` | `assertMgmtRead_` | (module-scoped) | `exportSalaryBreakupExcel_` | AuthAndApi.gs:339 |
| `saveWonHandover` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, TENDER_USER, BDM_MANAGER | `saveWonHandover_` | AuthAndApi.gs:340 |
| `getWonHandover` | `assertMgmtRead_` | (module-scoped) | `getWonHandover_` | AuthAndApi.gs:341 |
| `resendWonHandover` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, TENDER_USER, BDM_MANAGER | `resendWonHandover_` | AuthAndApi.gs:342 |
| `getHandoverAttachOptions` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, TENDER_USER, BDM_MANAGER | `getHandoverAttachOptions_` | AuthAndApi.gs:345 |
| `sendTenderPaymentRequest` | `assertTender_` | (module-scoped) | `sendTenderPaymentRequest_` | AuthAndApi.gs:346 |
| `requestTenderOrderPayment` | `assertTender_` | (module-scoped) | `requestTenderOrderPayment_` | AuthAndApi.gs:347 |
| `markTenderPaymentPaid` | `assertRole_` | SUPER_ADMIN, ADMIN, ACCOUNTS, MANAGEMENT | `markTenderPaymentPaid_` | AuthAndApi.gs:348 |
| `listInvoices` | **none** | — | `listInvoices_` | AuthAndApi.gs:350 |
| `getInvoice` | **none** | — | `getInvoice_` | AuthAndApi.gs:351 |
| `getInvoiceFromTender` | **none** | — | `getInvoiceFromTender_` | AuthAndApi.gs:352 |
| `saveInvoice` | **none** | — | `saveInvoice_` | AuthAndApi.gs:353 |
| `cancelInvoice` | **none** | — | `cancelInvoice_` | AuthAndApi.gs:354 |
| `recordReceipt` | **none** | — | `recordReceipt_` | AuthAndApi.gs:355 |
| `approveReceipt` | **none** | — | `approveReceipt_` | AuthAndApi.gs:356 |
| `rejectReceipt` | **none** | — | `rejectReceipt_` | AuthAndApi.gs:357 |
| `listBills` | **none** | — | `listBills_` | AuthAndApi.gs:358 |
| `getBill` | **none** | — | `getBill_` | AuthAndApi.gs:359 |
| `saveBill` | **none** | — | `saveBill_` | AuthAndApi.gs:360 |
| `cancelBill` | **none** | — | `cancelBill_` | AuthAndApi.gs:361 |
| `recordVendorPayment` | **none** | — | `recordVendorPayment_` | AuthAndApi.gs:362 |
| `approveVendorPayment` | **none** | — | `approveVendorPayment_` | AuthAndApi.gs:363 |
| `rejectVendorPayment` | **none** | — | `rejectVendorPayment_` | AuthAndApi.gs:364 |
| `listBankAccounts` | **none** | — | `listBankAccounts_` | AuthAndApi.gs:365 |
| `saveBankAccount` | **none** | — | `saveBankAccount_` | AuthAndApi.gs:366 |
| `getBankBook` | **none** | — | `getBankBook_` | AuthAndApi.gs:367 |
| `getAccountsOverview` | **none** | — | `getAccountsOverview_` | AuthAndApi.gs:368 |
| `getReceivableAgeing` | **none** | — | `getReceivableAgeing_` | AuthAndApi.gs:369 |
| `getPayableAgeing` | **none** | — | `getPayableAgeing_` | AuthAndApi.gs:370 |
| `getGstrSummary` | **none** | — | `getGstrSummary_` | AuthAndApi.gs:371 |
| `getTdsSummary` | **none** | — | `getTdsSummary_` | AuthAndApi.gs:372 |
| `getProfitLoss` | **none** | — | `getProfitLoss_` | AuthAndApi.gs:373 |
| `listAccountsApprovals` | **none** | — | `listAccountsApprovals_` | AuthAndApi.gs:374 |
| `getManagementApprovals` | **none** | — | `getManagementApprovals_` | AuthAndApi.gs:377 |
| `approveTenderPaymentByMgmt` | **none** | — | `approveTenderPaymentByMgmt_` | AuthAndApi.gs:378 |
| `rejectTenderPaymentByMgmt` | **none** | — | `rejectTenderPaymentByMgmt_` | AuthAndApi.gs:379 |
| `approveIndentByMgmt` | **none** | — | `approveIndentByMgmt_` | AuthAndApi.gs:380 |
| `rejectIndentByMgmt` | **none** | — | `rejectIndentByMgmt_` | AuthAndApi.gs:381 |
| `approvePurchaseRequestByMgmt` | **none** | — | `approvePurchaseRequestByMgmt_` | AuthAndApi.gs:382 |
| `rejectPurchaseRequestByMgmt` | **none** | — | `rejectPurchaseRequestByMgmt_` | AuthAndApi.gs:383 |
| `approveBackofficePaymentByMgmt` | **none** | — | `approveBackofficePaymentByMgmt_` | AuthAndApi.gs:384 |
| `rejectBackofficePaymentByMgmt` | **none** | — | `rejectBackofficePaymentByMgmt_` | AuthAndApi.gs:385 |
| `sendQuotationEmail` | `assertOffice_` | (module-scoped) | `sendQuotationEmail_` | AuthAndApi.gs:386 |
| `saveCompanyProfile` | `assertRole_` | ADMIN | `saveCompanyProfile_` | AuthAndApi.gs:387 |
| `sendProfileEmail` | `assertOffice_` | (module-scoped) | `sendProfileEmail_` | AuthAndApi.gs:388 |
| `downloadCompanyPresentation` | `assertOffice_` | (module-scoped) | `getCompanyPresentation_` | AuthAndApi.gs:392 |
| `downloadCompanyProfile` | `assertOffice_` | (module-scoped) | `getCompanyProfile_` | AuthAndApi.gs:393 |
| `saveCompanyPresentationPpt` | `assertRole_` | ADMIN | `saveCompanyPresentationPpt_` | AuthAndApi.gs:397 |
| `downloadCompanyPresentationPpt` | `assertOffice_` | (module-scoped) | `getCompanyPresentationPpt_` | AuthAndApi.gs:398 |
| `companyPresentationStatus` | `assertOffice_` | (module-scoped) | `companyPresentationStatus_` | AuthAndApi.gs:399 |
| `sendBulkEmail` | `assertRole_` | SUPER_ADMIN, ADMIN, COORDINATOR, BDM_MANAGER | `sendBulkEmail_` | AuthAndApi.gs:400 |
| `getMarketingTemplates` | `assertOffice_` | (module-scoped) | `getMarketingTemplates_` | AuthAndApi.gs:401 |
| `getMarketingTemplate` | `assertOffice_` | (module-scoped) | `getCustomTemplateHtml_` | AuthAndApi.gs:402 |
| `saveMarketingTemplate` | `assertRole_` | ADMIN | `saveMarketingTemplate_` | AuthAndApi.gs:403 |
| `deleteMarketingTemplate` | `assertRole_` | ADMIN | `deleteMarketingTemplate_` | AuthAndApi.gs:404 |
| `getSavedRecipients` | `assertOffice_` | (module-scoped) | `getSavedRecipients_` | AuthAndApi.gs:405 |
| `saveEmailRecipient` | `assertOffice_` | (module-scoped) | `saveEmailRecipient_` | AuthAndApi.gs:406 |
| `deleteEmailRecipient` | `assertOffice_` | (module-scoped) | `deleteEmailRecipient_` | AuthAndApi.gs:407 |
| `previewMarketingTemplate` | `assertOffice_` | (module-scoped) | `previewMarketingTemplate_` | AuthAndApi.gs:408 |
| `getClient` | `assertSalesMgmtRead_` | (module-scoped) | `getClientDetails_` | AuthAndApi.gs:409 |
| `getClientProfile` | `assertSalesMgmtRead_` | (module-scoped) | `getClientProfile_` | AuthAndApi.gs:412 |
| `saveClient` | `assertOffice_` | (module-scoped) | `saveClient_` | AuthAndApi.gs:413 |
| `uploadClientDocument` | `assertOffice_` | (module-scoped) | `uploadClientDocument_` | AuthAndApi.gs:414 |
| `saveClientContract` | `assertOffice_` | (module-scoped) | `saveClientContract_` | AuthAndApi.gs:415 |
| `generateClientFinalPdf` | `assertOffice_` | (module-scoped) | `generateClientFinalQuotationPdf_` | AuthAndApi.gs:416 |
| `generateClientFilePdf` | `assertOffice_` | (module-scoped) | `generateClientFilePdf_` | AuthAndApi.gs:419 |
| `clientProfilePdf` | `assertOffice_` | (module-scoped) | `clientProfilePdf_` | AuthAndApi.gs:421 |
| `getContractRenewals` | **none** | — | `getContractRenewals_` | AuthAndApi.gs:425 |
| `getOpenComplaints` | **none** | — | `getOpenComplaints_` | AuthAndApi.gs:426 |
| `getClientComplaints` | **none** | — | `getClientComplaints_` | AuthAndApi.gs:427 |
| `saveComplaint` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:428 |
| `updateComplaint` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:429 |
| `complaintSummaryPdf` | **none** | — | `complaintSummaryPdf_` | AuthAndApi.gs:430 |
| `getLoginHistory` | **none** | — | `getLoginHistory_` | AuthAndApi.gs:431 |
| `unlockLogin` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:432 |
| `getSafeguards` | **none** | — | `getSafeguards_` | AuthAndApi.gs:433 |
| `setSafeguard` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:434 |
| `backupNow` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:435 |
| `setNightlyBackup` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:436 |
| `getWageRevision` | **none** | — | `getWageRevision_` | AuthAndApi.gs:437 |
| `saveClientWageProfile` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:438 |
| `saveWageSkillMap` | **none** | — | `ccWriteThenRedraw_` | AuthAndApi.gs:439 |
| `wageRevisionLetterPdf` | **none** | — | `wageRevisionLetterPdf_` | AuthAndApi.gs:440 |
| `wageRevisionLettersPdf` | **none** | — | `wageRevisionLettersPdf_` | AuthAndApi.gs:441 |
| `getWinLossReport` | **none** | — | `getWinLossReport_` | AuthAndApi.gs:442 |
| `saveSalesTargets` | `assertTender_` | (module-scoped) | `ccWriteThenRedraw_` | AuthAndApi.gs:443 |
| `breakupWageContext` | **none** | — | `breakupWageContext_` | AuthAndApi.gs:447 |
| `breakupFetchWages` | **none** | — | `breakupFetchWages_` | AuthAndApi.gs:448 |
| `wageNewRatesInfo` | `assertTender_` | (module-scoped) | `wageNewRatesInfo_` | AuthAndApi.gs:449 |
| `wageNewRatesGet` | `assertTender_` | (module-scoped) | `wageNewRatesGet_` | AuthAndApi.gs:450 |
| `wageNewRatesRead` | `assertTender_` | (module-scoped) | `wageNewRatesRead_` | AuthAndApi.gs:451 |
| `wageNewRatesExtract` | `assertTender_` | (module-scoped) | `wageNewRatesExtract_` | AuthAndApi.gs:452 |
| `wageNewRatesReview` | `assertTender_` | (module-scoped) | `wageNewRatesReview_` | AuthAndApi.gs:453 |
| `wageNewRatesApprove` | `assertTender_` | (module-scoped) | `wageNewRatesApprove_` | AuthAndApi.gs:454 |
| `wageNewRatesDiscard` | `assertTender_` | (module-scoped) | `wageNewRatesDiscard_` | AuthAndApi.gs:455 |
| `generateTenderOrderFilePdf` | `assertRole_` | SUPER_ADMIN, ADMIN, TENDER_USER, BDM_MANAGER | `generateTenderOrderFilePdf_` | AuthAndApi.gs:456 |
| `saveTenderOrderBreakup` | `assertRole_` | SUPER_ADMIN, ADMIN, TENDER_USER, BDM_MANAGER | `saveTenderOrderBreakup_` | AuthAndApi.gs:457 |
| `getTender` | **none** | — | `getTenderDetails_` | AuthAndApi.gs:458 |
| `saveTender` | `assertTender_` | (module-scoped) | `saveTender_` | AuthAndApi.gs:459 |
| `addTenderFollowup` | `assertTender_` | (module-scoped) | `addTenderFollowup_` | AuthAndApi.gs:460 |
| `getTenderOrder` | **none** | — | `getTenderOrderDetails_` | AuthAndApi.gs:461 |
| `saveTenderOrder` | `assertTender_` | (module-scoped) | `saveTenderOrder_` | AuthAndApi.gs:462 |
| `backfillMissingTenderOrders` | `assertRole_` | SUPER_ADMIN, ADMIN | `backfillMissingTenderOrders_` | AuthAndApi.gs:463 |
| `uploadTenderOrderDocument` | `assertTender_` | (module-scoped) | `uploadTenderOrderDocument_` | AuthAndApi.gs:464 |
| `getSDEntry` | `assertTender_` | (module-scoped) | `getSDEntry_` | AuthAndApi.gs:465 |
| `listAITenders` | **none** | — | `listAITenders_` | AuthAndApi.gs:473 |
| `getAITender` | **none** | — | `getAITender_` | AuthAndApi.gs:474 |
| `listUnattachedTenders` | **none** | — | `listUnattachedTenders_` | AuthAndApi.gs:475 |
| `createAITender` | `assertTender_` | (module-scoped) | `createAITender_` | AuthAndApi.gs:476 |
| `createDraftTender` | `assertTender_` | (module-scoped) | `createDraftTender_` | AuthAndApi.gs:478 |
| `confirmDraftTender` | `assertTender_` | (module-scoped) | `confirmDraftTender_` | AuthAndApi.gs:479 |
| `discardDraftTender` | `assertTender_` | (module-scoped) | `discardDraftTender_` | AuthAndApi.gs:480 |
| `checkTenderDuplicates` | **none** | — | `findDuplicateTenders_` | AuthAndApi.gs:481 |
| `getAnalysisChanges` | **none** | — | `getAnalysisChanges_` | AuthAndApi.gs:482 |
| `prefillTenderFromDocument` | `assertTender_` | (module-scoped) | `prefillTenderFromDocument_` | AuthAndApi.gs:483 |
| `attachAITender` | `assertTender_` | (module-scoped) | `attachAITender_` | AuthAndApi.gs:484 |
| `updateAITenderMeta` | `assertTender_` | (module-scoped) | `updateAITenderMeta_` | AuthAndApi.gs:485 |
| `listTenderDocuments` | **none** | — | `listTenderDocuments_` | AuthAndApi.gs:487 |
| `uploadTenderDocument` | `assertTender_` | (module-scoped) | `uploadTenderDocument_` | AuthAndApi.gs:488 |
| `replaceTenderDocument` | `assertTender_` | (module-scoped) | `replaceTenderDocument_` | AuthAndApi.gs:489 |
| `deleteTenderDocument` | `assertTender_` | (module-scoped) | `deleteTenderDocument_` | AuthAndApi.gs:490 |
| `extractTenderDocumentText` | `assertTender_` | (module-scoped) | `extractTenderDocumentText_` | AuthAndApi.gs:491 |
| `wageBootstrap` | **none** | — | `wageBootstrap_` | AuthAndApi.gs:498 |
| `wageDiagnose` | **none** | — | `wageDiagnose_` | AuthAndApi.gs:503 |
| `wageRateLookup` | **none** | — | `wageRateLookup_` | AuthAndApi.gs:504 |
| `listWageRates` | **none** | — | `listWageRates_` | AuthAndApi.gs:505 |
| `listWageZoneMap` | **none** | — | `listWageZoneMap_` | AuthAndApi.gs:506 |
| `wageServiceSectorMap` | **none** | — | `wageServiceSectorMap_` | AuthAndApi.gs:507 |
| `seedMinimumWages` | `assertTender_` | (module-scoped) | `seedMinimumWages_` | AuthAndApi.gs:508 |
| `resetMinimumWageSeed` | `assertTender_` | (module-scoped) | `resetMinimumWageSeed_` | AuthAndApi.gs:511 |
| `saveWageRateSet` | `assertTender_` | (module-scoped) | `saveWageRateSet_` | AuthAndApi.gs:512 |
| `confirmWageRateSet` | `assertTender_` | (module-scoped) | `confirmWageRateSet_` | AuthAndApi.gs:513 |
| `deleteWageRateSet` | `assertTender_` | (module-scoped) | `deleteWageRateSet_` | AuthAndApi.gs:514 |
| `clearWageRateSets` | `assertTender_` | (module-scoped) | `clearWageRateSets_` | AuthAndApi.gs:515 |
| `loadKarnatakaRates` | `assertTender_` | (module-scoped) | `loadKarnatakaRates_` | AuthAndApi.gs:516 |
| `wageSheetsReport` | **none** | — | `wageSheetsReport_` | AuthAndApi.gs:517 |
| `purgeBlankWageRows` | `assertTender_` | (module-scoped) | `purgeBlankWageRows_` | AuthAndApi.gs:518 |
| `saveWageRate` | `assertTender_` | (module-scoped) | `saveWageRate_` | AuthAndApi.gs:519 |
| `deleteWageRate` | `assertTender_` | (module-scoped) | `deleteWageRate_` | AuthAndApi.gs:520 |
| `saveWageZoneMap` | `assertTender_` | (module-scoped) | `saveWageZoneMap_` | AuthAndApi.gs:521 |
| `deleteWageZoneMap` | `assertTender_` | (module-scoped) | `deleteWageZoneMap_` | AuthAndApi.gs:522 |
| `thsBootstrap` | **none** | — | `thsBootstrap_` | AuthAndApi.gs:528 |
| `thsSearch` | **none** | — | `thsSearch_` | AuthAndApi.gs:529 |
| `thsListAreas` | **none** | — | `thsListAreas_` | AuthAndApi.gs:530 |
| `thsDiagnose` | **none** | — | `thsDiagnose_` | AuthAndApi.gs:531 |
| `seedTakeHomeSalary` | **none** | — | `seedTakeHomeSalary_` | AuthAndApi.gs:532 |
| `thsSaveManual` | **none** | — | `thsSaveManual_` | AuthAndApi.gs:533 |
| `thsSaveArea` | **none** | — | `thsSaveArea_` | AuthAndApi.gs:534 |
| `thsSetAreaStatus` | **none** | — | `thsSetAreaStatus_` | AuthAndApi.gs:535 |
| `thsSaveCategory` | **none** | — | `thsSaveCategory_` | AuthAndApi.gs:536 |
| `thsHistory` | **none** | — | `thsHistory_` | AuthAndApi.gs:537 |
| `thsTemplate` | **none** | — | `thsTemplate_` | AuthAndApi.gs:538 |
| `thsUploadPreview` | **none** | — | `thsUploadPreview_` | AuthAndApi.gs:539 |
| `thsUploadCommit` | **none** | — | `thsUploadCommit_` | AuthAndApi.gs:540 |
| `thsExport` | **none** | — | `thsExport_` | AuthAndApi.gs:541 |
| `uploadWageNotification` | `assertTender_` | (module-scoped) | `uploadWageNotification_` | AuthAndApi.gs:542 |
| `clearWageNotifications` | `assertTender_` | (module-scoped) | `clearWageNotifications_` | AuthAndApi.gs:547 |
| `linkWageNotification` | `assertTender_` | (module-scoped) | `linkWageNotification_` | AuthAndApi.gs:548 |
| `deleteWageNotification` | `assertTender_` | (module-scoped) | `deleteWageNotification_` | AuthAndApi.gs:549 |
| `getWageNotificationLink` | **none** | — | `getWageNotificationLink_` | AuthAndApi.gs:550 |
| `listWageNotifications` | **none** | — | `listWageNotifications_` | AuthAndApi.gs:551 |
| `exportWageRateCard` | **none** | — | `exportWageRateCard_` | AuthAndApi.gs:552 |
| `exportWageFloorCheck` | **none** | — | `exportWageFloorCheck_` | AuthAndApi.gs:553 |
| `askCrmAssistant` | **none** | — | `askCrmAssistant_` | AuthAndApi.gs:558 |
| `confirmAssistantAction` | **none** | — | `confirmAssistantAction_` | AuthAndApi.gs:559 |
| `getAssistantInfo` | **none** | — | `assistantInfo_` | AuthAndApi.gs:560 |
| `assistantBgControl` | **none** | — | `assistantBgControl_` | AuthAndApi.gs:564 |
| `draftLeadReply` | **none** | — | `assistantLeadReplyDraft_` | AuthAndApi.gs:567 |
| `testAIConnection` | `assertTender_` | (module-scoped) | `testAIConnection_` | AuthAndApi.gs:569 |
| `startTenderAnalysis` | `assertTender_` | (module-scoped) | `startTenderAnalysis_` | AuthAndApi.gs:570 |
| `runTenderAnalysisChunk` | `assertTender_` | (module-scoped) | `runTenderAnalysisChunk_` | AuthAndApi.gs:571 |
| `finalizeTenderAnalysis` | `assertTender_` | (module-scoped) | `finalizeTenderAnalysis_` | AuthAndApi.gs:572 |
| `cancelTenderAnalysis` | `assertTender_` | (module-scoped) | `cancelTenderAnalysis_` | AuthAndApi.gs:573 |
| `getTenderAnalysis` | **none** | — | `getTenderAnalysis_` | AuthAndApi.gs:574 |
| `listTenderAnalysisRuns` | **none** | — | `getTenderAnalysis_` | AuthAndApi.gs:575 |
| `saveAnalysisEdit` | `assertTender_` | (module-scoped) | `saveAnalysisEdit_` | AuthAndApi.gs:576 |
| `extractTenderBOQ` | `assertTender_` | (module-scoped) | `extractTenderBOQ_` | AuthAndApi.gs:577 |
| `listRequiredDocuments` | **none** | — | `listRequiredDocuments_` | AuthAndApi.gs:579 |
| `saveRequiredDocument` | `assertTender_` | (module-scoped) | `saveRequiredDocument_` | AuthAndApi.gs:580 |
| `deleteRequiredDocument` | `assertTender_` | (module-scoped) | `deleteRequiredDocument_` | AuthAndApi.gs:581 |
| `matchCompanyDocuments` | `assertTender_` | (module-scoped) | `matchCompanyDocuments_` | AuthAndApi.gs:583 |
| `attachCompanyDocument` | `assertTender_` | (module-scoped) | `attachCompanyDocument_` | AuthAndApi.gs:584 |
| `detachCompanyDocument` | `assertTender_` | (module-scoped) | `detachCompanyDocument_` | AuthAndApi.gs:585 |
| `listCompanyDocuments` | **none** | — | `listCompanyDocuments_` | AuthAndApi.gs:587 |
| `saveCompanyDocument` | `assertTender_` | (module-scoped) | `saveCompanyDocument_` | AuthAndApi.gs:588 |
| `uploadCompanyDocument` | `assertTender_` | (module-scoped) | `uploadCompanyDocument_` | AuthAndApi.gs:589 |
| `deleteCompanyDocument` | `assertTender_` | (module-scoped) | `deleteCompanyDocument_` | AuthAndApi.gs:590 |
| `listEligibilityCriteria` | **none** | — | `listEligibilityCriteria_` | AuthAndApi.gs:592 |
| `saveEligibilityCriterion` | `assertTender_` | (module-scoped) | `saveEligibilityCriterion_` | AuthAndApi.gs:593 |
| `listChecklistItems` | **none** | — | `listChecklistItems_` | AuthAndApi.gs:595 |
| `saveChecklistItem` | `assertTender_` | (module-scoped) | `saveChecklistItem_` | AuthAndApi.gs:596 |
| `deleteChecklistItem` | `assertTender_` | (module-scoped) | `deleteChecklistItem_` | AuthAndApi.gs:597 |
| `listClarifications` | **none** | — | `listClarifications_` | AuthAndApi.gs:599 |
| `saveClarification` | `assertTender_` | (module-scoped) | `saveClarification_` | AuthAndApi.gs:600 |
| `listBOQItems` | **none** | — | `listBOQItems_` | AuthAndApi.gs:602 |
| `listTenderAIActivity` | **none** | — | `listTenderAIActivity_` | AuthAndApi.gs:603 |
| `exportTenderAI` | **none** | — | `exportTenderAI_` | AuthAndApi.gs:605 |
| `exportCompanyDocuments` | **none** | — | `exportCompanyDocuments_` | AuthAndApi.gs:606 |
| `saveSDEntry` | `assertTender_` | (module-scoped) | `saveSDEntry_` | AuthAndApi.gs:607 |
| `importSDBulk` | `assertTender_` | (module-scoped) | `importSDBulk_` | AuthAndApi.gs:608 |
| `getTenderDailyReport` | **none** | — | `buildDailyTenderReport_` | AuthAndApi.gs:609 |
| `getTenderMonthlyReport` | **none** | — | `buildMonthlyTenderReport_` | AuthAndApi.gs:610 |
| `getFilteredTenderReport` | **none** | — | `buildFilteredTenderReport_` | AuthAndApi.gs:611 |
| `sendTenderReportNow` | `assertTender_` | (module-scoped) | `sendDailyTenderManagementReport` | AuthAndApi.gs:612 |
| `sendMonthlyTenderReportNow` | `assertRole_` | ADMIN | `sendMonthlyTenderManagementReport` | AuthAndApi.gs:613 |
| `saveUser` | `assertRole_` | ADMIN | `saveUser_` | AuthAndApi.gs:614 |
| `saveProfilePhoto` | **none** | — | `saveProfilePhoto_` | AuthAndApi.gs:615 |
| `getProfilePhoto` | **none** | — | `getProfilePhoto_` | AuthAndApi.gs:616 |
| `getProfilePhotos` | **none** | — | `getProfilePhotos_` | AuthAndApi.gs:617 |
| `changeMyPin` | **none** | — | `changeMyPin_` | AuthAndApi.gs:618 |
| `getDailyReport` | **none** | — | `buildDailyReport_` | AuthAndApi.gs:619 |
| `getMonthlyInsights` | **none** | — | `getMonthlyInsights_` | AuthAndApi.gs:622 |
| `getMonthlySalesReport` | **none** | — | `buildMonthlySalesReport_` | AuthAndApi.gs:623 |
| `getFilteredSalesReport` | **none** | — | `buildFilteredSalesReport_` | AuthAndApi.gs:624 |
| `sendReportNow` | `assertRole_` | ADMIN | `sendDailyManagementReport` | AuthAndApi.gs:625 |
| `sendMonthlySalesReportNow` | `assertRole_` | ADMIN | `sendMonthlySalesManagementReport` | AuthAndApi.gs:626 |
| `saveSettings` | `assertRole_` | SUPER_ADMIN | `saveSettings_` | AuthAndApi.gs:627 |
| `downloadGmailEmails` | `assertRole_` | ADMIN | `downloadGmailEmails_` | AuthAndApi.gs:628 |
| `getMyDailyReport` | **none** | — | `getDailyReportForUser_` | AuthAndApi.gs:629 |
| `saveMyDailyReport` | **none** | — | `saveDailyReport_` | AuthAndApi.gs:630 |
| `getTeamDailyReports` | **none** | — | `getTeamDailyReports_` | AuthAndApi.gs:633 |
| `exportDailyReports` | **none** | — | `exportDailyReports_` | AuthAndApi.gs:634 |
| `listEmailDirectory` | **none** | — | `listEmailDirectory_` | AuthAndApi.gs:635 |
| `updateEmailDirectoryEntry` | **none** | — | `updateEmailDirectoryEntry_` | AuthAndApi.gs:636 |
| `deleteEmailDirectoryEntry` | **none** | — | `deleteEmailDirectoryEntry_` | AuthAndApi.gs:637 |
| `exportEmailDirectory` | **none** | — | `exportEmailDirectory_` | AuthAndApi.gs:638 |
| `getEmailDirectoryStats` | **none** | — | `getEmailDirectoryStats_` | AuthAndApi.gs:639 |
| `captureEmailDirectoryAllTime` | **none** | — | `captureEmailDirectoryAllTime_` | AuthAndApi.gs:640 |
| `importEmailDirectoryFromCrm` | **none** | — | `importEmailDirectoryFromCrm_` | AuthAndApi.gs:641 |
| `listMarketingMailboxes` | **none** | — | `listMarketingMailboxes_` | AuthAndApi.gs:643 |
| `connectMarketingMailbox` | **none** | — | `connectMarketingMailbox_` | AuthAndApi.gs:644 |
| `disconnectMarketingMailbox` | **none** | — | `disconnectMarketingMailbox_` | AuthAndApi.gs:645 |
| `marketingOAuthStart` | **none** | — | `marketingOAuthStart_` | AuthAndApi.gs:646 |
| `startMarketingSync` | **none** | — | `startMarketingSync_` | AuthAndApi.gs:647 |
| `continueMarketingSync` | **none** | — | `continueMarketingSync_` | AuthAndApi.gs:648 |
| `listMarketingSyncJobs` | **none** | — | `listMarketingSyncJobs_` | AuthAndApi.gs:649 |
| `getMarketingSyncJob` | **none** | — | `getMarketingSyncJob_` | AuthAndApi.gs:650 |
| `listMarketingContacts` | **none** | — | `listMarketingContacts_` | AuthAndApi.gs:651 |
| `getMarketingContact` | **none** | — | `getMarketingContact_` | AuthAndApi.gs:652 |
| `updateMarketingContact` | **none** | — | `updateMarketingContact_` | AuthAndApi.gs:653 |
| `bulkMarketingContacts` | **none** | — | `bulkMarketingContacts_` | AuthAndApi.gs:654 |
| `exportMarketingContacts` | **none** | — | `exportMarketingContacts_` | AuthAndApi.gs:655 |
| `mergeMarketingContacts` | **none** | — | `mergeMarketingContacts_` | AuthAndApi.gs:656 |
| `convertMarketingContactToLead` | **none** | — | `convertMarketingContactToLead_` | AuthAndApi.gs:657 |
| `getMarketingDashboard` | **none** | — | `getMarketingDashboard_` | AuthAndApi.gs:658 |
| `listMarketingSegments` | **none** | — | `listMarketingSegments_` | AuthAndApi.gs:659 |
| `saveMarketingSegment` | **none** | — | `saveMarketingSegment_` | AuthAndApi.gs:660 |
| `deleteMarketingSegment` | **none** | — | `deleteMarketingSegment_` | AuthAndApi.gs:661 |
| `previewMarketingSegment` | **none** | — | `previewMarketingSegment_` | AuthAndApi.gs:662 |
| `listMarketingSuppression` | **none** | — | `listMarketingSuppression_` | AuthAndApi.gs:663 |
| `addMarketingSuppression` | **none** | — | `addMarketingSuppression_` | AuthAndApi.gs:664 |
| `removeMarketingSuppression` | **none** | — | `removeMarketingSuppression_` | AuthAndApi.gs:665 |
| `installMarketingSyncTrigger` | **none** | — | `installMarketingSyncTrigger_` | AuthAndApi.gs:666 |
| `uninstallMarketingSyncTrigger` | **none** | — | `uninstallMarketingSyncTrigger_` | AuthAndApi.gs:667 |
| `getSocialDashboard` | **none** | — | `getSocialDashboard_` | AuthAndApi.gs:669 |
| `listSocialPosts` | **none** | — | `listSocialPosts_` | AuthAndApi.gs:670 |
| `getSocialPost` | **none** | — | `getSocialPost_` | AuthAndApi.gs:671 |
| `saveSocialPost` | **none** | — | `saveSocialPost_` | AuthAndApi.gs:672 |
| `duplicateSocialPost` | **none** | — | `duplicateSocialPost_` | AuthAndApi.gs:673 |
| `deleteSocialPost` | **none** | — | `deleteSocialPost_` | AuthAndApi.gs:674 |
| `submitPostForApproval` | **none** | — | `submitPostForApproval_` | AuthAndApi.gs:675 |
| `approveSocialPost` | **none** | — | `approveSocialPost_` | AuthAndApi.gs:676 |
| `rejectSocialPost` | **none** | — | `rejectSocialPost_` | AuthAndApi.gs:677 |
| `scheduleSocialPost` | **none** | — | `scheduleSocialPost_` | AuthAndApi.gs:678 |
| `cancelSocialSchedule` | **none** | — | `cancelSocialSchedule_` | AuthAndApi.gs:679 |
| `publishSocialPostNow` | **none** | — | `publishSocialPostNow_` | AuthAndApi.gs:680 |
| `generateSocialPostContent` | **none** | — | `generateSocialPostContent_` | AuthAndApi.gs:681 |
| `generateSocialImageConcept` | **none** | — | `generateSocialImageConcept_` | AuthAndApi.gs:682 |
| `generateBulkContentPlan` | **none** | — | `generateBulkContentPlan_` | AuthAndApi.gs:683 |
| `listSocialAccounts` | **none** | — | `listSocialAccounts_` | AuthAndApi.gs:684 |
| `socialOAuthStart` | **none** | — | `socialOAuthStart_` | AuthAndApi.gs:685 |
| `disconnectSocialAccount` | **none** | — | `disconnectSocialAccount_` | AuthAndApi.gs:686 |
| `validateSocialAccount` | **none** | — | `validateSocialAccount_` | AuthAndApi.gs:687 |
| `listSocialMedia` | **none** | — | `listSocialMedia_` | AuthAndApi.gs:688 |
| `uploadSocialMedia` | **none** | — | `uploadSocialMedia_` | AuthAndApi.gs:689 |
| `updateSocialMedia` | **none** | — | `updateSocialMedia_` | AuthAndApi.gs:690 |
| `deleteSocialMedia` | **none** | — | `deleteSocialMedia_` | AuthAndApi.gs:691 |
| `listSocialTemplates` | **none** | — | `listSocialTemplates_` | AuthAndApi.gs:692 |
| `saveSocialTemplate` | **none** | — | `saveSocialTemplate_` | AuthAndApi.gs:693 |
| `deleteSocialTemplate` | **none** | — | `deleteSocialTemplate_` | AuthAndApi.gs:694 |
| `updateSocialAnalytics` | **none** | — | `updateSocialAnalytics_` | AuthAndApi.gs:695 |
| `listSocialAnalytics` | **none** | — | `listSocialAnalytics_` | AuthAndApi.gs:696 |
| `getSocialCalendar` | **none** | — | `getSocialCalendar_` | AuthAndApi.gs:697 |
| `installSocialScheduler` | **none** | — | `installSocialScheduler_` | AuthAndApi.gs:698 |
| `uninstallSocialScheduler` | **none** | — | `uninstallSocialScheduler_` | AuthAndApi.gs:699 |
| `listEmkAccounts` | **none** | — | `listEmkAccounts_` | AuthAndApi.gs:701 |
| `emkConnectStart` | **none** | — | `emkConnectStart_` | AuthAndApi.gs:702 |
| `disconnectEmkAccount` | **none** | — | `disconnectEmkAccount_` | AuthAndApi.gs:703 |
| `saveEmkAccountAllowed` | **none** | — | `saveEmkAccountAllowed_` | AuthAndApi.gs:704 |
| `testEmkAccount` | **none** | — | `testEmkAccount_` | AuthAndApi.gs:705 |
| `listEmkContacts` | **none** | — | `listEmkContacts_` | AuthAndApi.gs:706 |
| `addEmkContact` | **none** | — | `addEmkContact_` | AuthAndApi.gs:707 |
| `saveEmkContact` | **none** | — | `saveEmkContact_` | AuthAndApi.gs:708 |
| `unsubscribeEmkContact` | **none** | — | `unsubscribeEmkContact_` | AuthAndApi.gs:709 |
| `syncEmkFromCrm` | **none** | — | `syncEmkFromCrm_` | AuthAndApi.gs:710 |
| `exportEmkContacts` | **none** | — | `exportEmkContacts_` | AuthAndApi.gs:711 |
| `emkImportPreview` | **none** | — | `emkImportPreview_` | AuthAndApi.gs:712 |
| `emkImportContacts` | **none** | — | `emkImportContacts_` | AuthAndApi.gs:713 |
| `listEmkLists` | **none** | — | `listEmkLists_` | AuthAndApi.gs:714 |
| `saveEmkList` | **none** | — | `saveEmkList_` | AuthAndApi.gs:715 |
| `deleteEmkList` | **none** | — | `deleteEmkList_` | AuthAndApi.gs:716 |
| `emkListMembers` | **none** | — | `emkListMembers_` | AuthAndApi.gs:717 |
| `emkListAddMembers` | **none** | — | `emkListAddMembers_` | AuthAndApi.gs:718 |
| `emkListRemoveMember` | **none** | — | `emkListRemoveMember_` | AuthAndApi.gs:719 |
| `listEmkSegments` | **none** | — | `listEmkSegments_` | AuthAndApi.gs:720 |
| `saveEmkSegment` | **none** | — | `saveEmkSegment_` | AuthAndApi.gs:721 |
| `deleteEmkSegment` | **none** | — | `deleteEmkSegment_` | AuthAndApi.gs:722 |
| `previewEmkSegment` | **none** | — | `previewEmkSegment_` | AuthAndApi.gs:723 |
| `listEmkTemplates` | **none** | — | `listEmkTemplates_` | AuthAndApi.gs:724 |
| `getEmkTemplate` | **none** | — | `getEmkTemplate_` | AuthAndApi.gs:725 |
| `saveEmkTemplate` | **none** | — | `saveEmkTemplate_` | AuthAndApi.gs:726 |
| `deleteEmkTemplate` | **none** | — | `deleteEmkTemplate_` | AuthAndApi.gs:727 |
| `duplicateEmkTemplate` | **none** | — | `duplicateEmkTemplate_` | AuthAndApi.gs:728 |
| `favoriteEmkTemplate` | **none** | — | `favoriteEmkTemplate_` | AuthAndApi.gs:729 |
| `listEmkCampaigns` | **none** | — | `listEmkCampaigns_` | AuthAndApi.gs:730 |
| `getEmkCampaign` | **none** | — | `getEmkCampaign_` | AuthAndApi.gs:731 |
| `saveEmkCampaign` | **none** | — | `saveEmkCampaign_` | AuthAndApi.gs:732 |
| `deleteEmkCampaign` | **none** | — | `deleteEmkCampaign_` | AuthAndApi.gs:733 |
| `submitEmkCampaign` | **none** | — | `submitEmkCampaign_` | AuthAndApi.gs:734 |
| `reviewEmkCampaign` | **none** | — | `reviewEmkCampaign_` | AuthAndApi.gs:735 |
| `emkQualityCheck` | **none** | — | `emkQualityCheck_` | AuthAndApi.gs:736 |
| `startEmkCampaign` | **none** | — | `startEmkCampaign_` | AuthAndApi.gs:737 |
| `scheduleEmkCampaign` | **none** | — | `scheduleEmkCampaign_` | AuthAndApi.gs:738 |
| `pauseEmkCampaign` | **none** | — | `pauseEmkCampaign_` | AuthAndApi.gs:739 |
| `resumeEmkCampaign` | **none** | — | `resumeEmkCampaign_` | AuthAndApi.gs:740 |
| `cancelEmkCampaign` | **none** | — | `cancelEmkCampaign_` | AuthAndApi.gs:741 |
| `listEmkRecipients` | **none** | — | `listEmkRecipients_` | AuthAndApi.gs:742 |
| `listEmkScheduled` | **none** | — | `listEmkScheduled_` | AuthAndApi.gs:743 |
| `getEmkDashboard` | **none** | — | `getEmkDashboard_` | AuthAndApi.gs:744 |
| `getEmkAnalytics` | **none** | — | `getEmkAnalytics_` | AuthAndApi.gs:745 |
| `listEmkUnsubscribed` | **none** | — | `listEmkUnsubscribed_` | AuthAndApi.gs:746 |
| `listEmkAudit` | **none** | — | `listEmkAudit_` | AuthAndApi.gs:747 |
| `markEmkBounce` | **none** | — | `markEmkBounce_` | AuthAndApi.gs:748 |
| `emkAiSubjects` | **none** | — | `emkAiSubjects_` | AuthAndApi.gs:749 |
| `emkAiBody` | **none** | — | `emkAiBody_` | AuthAndApi.gs:750 |
| `emkAiRewrite` | **none** | — | `emkAiRewrite_` | AuthAndApi.gs:751 |
| `emkAiPreview` | **none** | — | `emkAiPreview_` | AuthAndApi.gs:752 |
| `getEmailDirectoryCaptureStatus` | **none** | — | `getEmailDirectoryCaptureStatus_` | AuthAndApi.gs:753 |
| `installEmailDirectoryTrigger` | **none** | — | `installEmailDirectoryTrigger_` | AuthAndApi.gs:754 |
| `uninstallEmailDirectoryTrigger` | **none** | — | `uninstallEmailDirectoryTrigger_` | AuthAndApi.gs:755 |
| `bulkImportPreview` | **none** | — | `bulkImportPreview_` | AuthAndApi.gs:756 |
| `bulkImportCommit` | **none** | — | `bulkImportCommit_` | AuthAndApi.gs:757 |
| `bulkImportCancel` | **none** | — | `bulkImportCancel_` | AuthAndApi.gs:758 |
| `getBulkImportTemplate` | **none** | — | `getBulkImportTemplate_` | AuthAndApi.gs:759 |
| `getBulkImportHistory` | **none** | — | `getBulkImportHistory_` | AuthAndApi.gs:760 |
| `listEmployees` | **none** | — | `listEmployees_` | AuthAndApi.gs:762 |
| `getEmployee` | **none** | — | `getEmployee_` | AuthAndApi.gs:763 |
| `saveEmployee` | **none** | — | `saveEmployee_` | AuthAndApi.gs:764 |
| `deactivateEmployee` | **none** | — | `deactivateEmployee_` | AuthAndApi.gs:765 |
| `getEmployeeOptions` | **none** | — | `getEmployeeOptions_` | AuthAndApi.gs:766 |
| `uploadEmployeeDocument` | **none** | — | `uploadEmployeeDocument_` | AuthAndApi.gs:767 |
| `deleteEmployeeDocument` | **none** | — | `deleteEmployeeDocument_` | AuthAndApi.gs:768 |
| `getHRSummary` | **none** | — | `getHRSummary_` | AuthAndApi.gs:769 |
| `listSalarySlips` | **none** | — | `listSalarySlips_` | AuthAndApi.gs:770 |
| `getSalarySlip` | **none** | — | `getSalarySlip_` | AuthAndApi.gs:771 |
| `previewSalarySlip` | **none** | — | `previewSalarySlip_` | AuthAndApi.gs:772 |
| `generateSalarySlip` | **none** | — | `generateSalarySlip_` | AuthAndApi.gs:773 |
| `emailSalarySlip` | **none** | — | `emailSalarySlip_` | AuthAndApi.gs:774 |
| `getSalarySlipOptions` | **none** | — | `getSalarySlipOptions_` | AuthAndApi.gs:775 |
| `cancelSalarySlip` | **none** | — | `cancelSalarySlip_` | AuthAndApi.gs:776 |
| `listPayrollRuns` | **none** | — | `listPayrollRuns_` | AuthAndApi.gs:777 |
| `getPayrollRun` | **none** | — | `getPayrollRun_` | AuthAndApi.gs:778 |
| `createPayrollRun` | **none** | — | `createPayrollRun_` | AuthAndApi.gs:779 |
| `updatePayrollRun` | **none** | — | `updatePayrollRun_` | AuthAndApi.gs:780 |
| `cancelPayrollRun` | **none** | — | `cancelPayrollRun_` | AuthAndApi.gs:781 |
| `exportPayrollRun` | **none** | — | `exportPayrollRun_` | AuthAndApi.gs:782 |
| `listEsiRegisters` | **none** | — | `listEsiRegisters_` | AuthAndApi.gs:783 |
| `getEsiRegister` | **none** | — | `getEsiRegister_` | AuthAndApi.gs:784 |
| `createEsiRegisterFromPayroll` | **none** | — | `createEsiRegisterFromPayroll_` | AuthAndApi.gs:785 |
| `recordEsiFiling` | **none** | — | `recordEsiFiling_` | AuthAndApi.gs:786 |
| `listPfRegisters` | **none** | — | `listPfRegisters_` | AuthAndApi.gs:787 |
| `getPfRegister` | **none** | — | `getPfRegister_` | AuthAndApi.gs:788 |
| `createPfRegisterFromPayroll` | **none** | — | `createPfRegisterFromPayroll_` | AuthAndApi.gs:789 |
| `recordPfFiling` | **none** | — | `recordPfFiling_` | AuthAndApi.gs:790 |
| `downloadEsiPfRegister` | **none** | — | `downloadEsiPfRegister_` | AuthAndApi.gs:791 |
| `listAssets` | **none** | — | `listAssets_` | AuthAndApi.gs:793 |
| `getAsset` | **none** | — | `getAsset_` | AuthAndApi.gs:794 |
| `saveAsset` | **none** | — | `saveAsset_` | AuthAndApi.gs:795 |
| `assignAsset` | **none** | — | `assignAsset_` | AuthAndApi.gs:796 |
| `returnAsset` | **none** | — | `returnAsset_` | AuthAndApi.gs:797 |
| `retireAsset` | **none** | — | `retireAsset_` | AuthAndApi.gs:798 |
| `deleteAsset` | **none** | — | `deleteAsset_` | AuthAndApi.gs:799 |
| `getAssetOptions` | **none** | — | `getAssetOptions_` | AuthAndApi.gs:800 |
| `getAssetSummary` | **none** | — | `getAssetSummary_` | AuthAndApi.gs:801 |
| `listStockItems` | **none** | — | `listStockItems_` | AuthAndApi.gs:802 |
| `getStockItem` | **none** | — | `getStockItem_` | AuthAndApi.gs:803 |
| `saveStockItem` | **none** | — | `saveStockItem_` | AuthAndApi.gs:804 |
| `deleteStockItem` | **none** | — | `deleteStockItem_` | AuthAndApi.gs:805 |
| `listStockPurchases` | **none** | — | `listStockPurchases_` | AuthAndApi.gs:806 |
| `getStockPurchase` | **none** | — | `getStockPurchase_` | AuthAndApi.gs:807 |
| `saveStockPurchase` | **none** | — | `saveStockPurchase_` | AuthAndApi.gs:808 |
| `getLowStockAlerts` | **none** | — | `getLowStockAlerts_` | AuthAndApi.gs:809 |
| `getStockItemOptions` | **none** | — | `getStockItemOptions_` | AuthAndApi.gs:810 |
| `getLowStockCount` | **none** | — | `getLowStockCount_` | AuthAndApi.gs:811 |
| `listStockDistributions` | **none** | — | `listStockDistributions_` | AuthAndApi.gs:812 |
| `getStockDistribution` | **none** | — | `getStockDistribution_` | AuthAndApi.gs:813 |
| `saveStockDistribution` | **none** | — | `saveStockDistribution_` | AuthAndApi.gs:814 |
| `getAdminErpSummary` | **none** | — | `getAdminErpSummary_` | AuthAndApi.gs:815 |
| `listVendors` | **none** | — | `listVendors_` | AuthAndApi.gs:816 |
| `getVendor` | **none** | — | `getVendor_` | AuthAndApi.gs:817 |
| `saveVendor` | **none** | — | `saveVendor_` | AuthAndApi.gs:818 |
| `deleteVendor` | **none** | — | `deleteVendor_` | AuthAndApi.gs:819 |
| `getVendorOptions` | **none** | — | `getVendorOptions_` | AuthAndApi.gs:820 |
| `listPurchaseOrders` | **none** | — | `listPurchaseOrders_` | AuthAndApi.gs:821 |
| `getPurchaseOrder` | **none** | — | `getPurchaseOrder_` | AuthAndApi.gs:822 |
| `savePurchaseOrder` | **none** | — | `savePurchaseOrder_` | AuthAndApi.gs:823 |
| `releasePurchaseOrder` | **none** | — | `releasePurchaseOrder_` | AuthAndApi.gs:824 |
| `acknowledgePurchaseOrder` | **none** | — | `acknowledgePurchaseOrder_` | AuthAndApi.gs:825 |
| `receivePurchaseOrder` | **none** | — | `receivePurchaseOrder_` | AuthAndApi.gs:826 |
| `cancelPurchaseOrder` | **none** | — | `cancelPurchaseOrder_` | AuthAndApi.gs:827 |
| `getPurchaseOrderPdf` | **none** | — | `getPurchaseOrderPdf_` | AuthAndApi.gs:828 |
| `listIndents` | **none** | — | `listIndents_` | AuthAndApi.gs:830 |
| `getIndent` | **none** | — | `getIndent_` | AuthAndApi.gs:831 |
| `saveIndent` | **none** | — | `saveIndent_` | AuthAndApi.gs:832 |
| `deleteIndent` | **none** | — | `deleteIndent_` | AuthAndApi.gs:833 |
| `sendIndentForApproval` | **none** | — | `sendIndentForApproval_` | AuthAndApi.gs:834 |
| `approveIndentByToken` | **none** | — | `approveIndentByToken_` | AuthAndApi.gs:835 |
| `rejectIndentByToken` | **none** | — | `rejectIndentByToken_` | AuthAndApi.gs:836 |
| `listPurchaseRequestsAdmin` | **none** | — | `listPurchaseRequestsAdmin_` | AuthAndApi.gs:837 |
| `getPurchaseRequestAdmin` | **none** | — | `getPurchaseRequestAdmin_` | AuthAndApi.gs:838 |
| `savePurchaseRequestAdmin` | **none** | — | `savePurchaseRequestAdmin_` | AuthAndApi.gs:839 |
| `deletePurchaseRequestAdmin` | **none** | — | `deletePurchaseRequestAdmin_` | AuthAndApi.gs:840 |
| `sendPurchaseRequestForApproval` | **none** | — | `sendPurchaseRequestForApproval_` | AuthAndApi.gs:841 |
| `convertPRToPO` | **none** | — | `convertPRToPO_` | AuthAndApi.gs:842 |
| `approvePurchaseRequestByToken` | **none** | — | `approvePurchaseRequestByToken_` | AuthAndApi.gs:843 |
| `rejectPurchaseRequestByToken` | **none** | — | `rejectPurchaseRequestByToken_` | AuthAndApi.gs:844 |
| `recordDistributionUtilisation` | **none** | — | `recordDistributionUtilisation_` | AuthAndApi.gs:845 |
| `acknowledgeDistribution` | **none** | — | `acknowledgeDistribution_` | AuthAndApi.gs:846 |
| `sendDistributionEmail` | **none** | — | `sendDistributionEmail_` | AuthAndApi.gs:847 |
| `generateDeliveryChallan` | **none** | — | `generateDeliveryChallan_` | AuthAndApi.gs:848 |
| `listPaymentStatus` | **none** | — | `listPaymentStatus_` | AuthAndApi.gs:849 |
| `updatePaymentStatus` | **none** | — | `updatePaymentStatus_` | AuthAndApi.gs:850 |
| `reportPerSite` | **none** | — | `reportPerSite_` | AuthAndApi.gs:851 |
| `reportPerItem` | **none** | — | `reportPerItem_` | AuthAndApi.gs:852 |
| `reportStockLedger` | **none** | — | `reportStockLedger_` | AuthAndApi.gs:853 |
| `csBootstrap` | **none** | — | `csBootstrap_` | AuthAndApi.gs:856 |
| `csSaveProject` | **none** | — | `csSaveProject_` | AuthAndApi.gs:857 |
| `csListProjects` | **none** | — | `csListProjects_` | AuthAndApi.gs:858 |
| `csDeleteProject` | **none** | — | `csDeleteProject_` | AuthAndApi.gs:859 |
| `csDuplicateProject` | **none** | — | `csDuplicateProject_` | AuthAndApi.gs:860 |
| `csScheduleProject` | **none** | — | `csScheduleProject_` | AuthAndApi.gs:861 |
| `csGenerate` | **none** | — | `csGenerate_` | AuthAndApi.gs:862 |
| `csImprovePrompt` | **none** | — | `csImprovePrompt_` | AuthAndApi.gs:863 |
| `csGenerateCopy` | **none** | — | `csGenerateCopy_` | AuthAndApi.gs:864 |
| `csQualityCheck` | **none** | — | `csQualityCheck_` | AuthAndApi.gs:865 |
| `csGetAssetData` | **none** | — | `csGetAssetData_` | AuthAndApi.gs:866 |
| `csListTemplates` | **none** | — | `csListTemplates_` | AuthAndApi.gs:867 |
| `csSaveTemplate` | **none** | — | `csSaveTemplate_` | AuthAndApi.gs:868 |
| `csDeleteTemplate` | **none** | — | `csDeleteTemplate_` | AuthAndApi.gs:869 |
| `csGetBrandKit` | **none** | — | `csGetBrandKit_` | AuthAndApi.gs:870 |
| `csSaveBrandKit` | **none** | — | `csSaveBrandKit_` | AuthAndApi.gs:871 |
| `csUploadLogo` | **none** | — | `csUploadLogo_` | AuthAndApi.gs:872 |
| `csGetBrandLogo` | **none** | — | `csGetBrandLogo_` | AuthAndApi.gs:873 |
| `csLoadProviders` | **none** | — | `csLoadProviders_` | AuthAndApi.gs:874 |
| `csSaveProviders` | **none** | — | `csSaveProviders_` | AuthAndApi.gs:875 |
| `csUsage` | **none** | — | `csUsage_` | AuthAndApi.gs:876 |
| `csListCampaigns` | **none** | — | `csListCampaigns_` | AuthAndApi.gs:877 |
| `csSaveCampaign` | **none** | — | `csSaveCampaign_` | AuthAndApi.gs:878 |

## 6. Server function index

All 1,723 top-level functions with file, line span, visibility and cross-file
callers are exported to `migration/source-inventory/function-index.csv` for the traceability
matrix. Public (no trailing underscore) functions are the legacy API surface; trailing-underscore
functions are internal and are mapped to service methods rather than endpoints.

