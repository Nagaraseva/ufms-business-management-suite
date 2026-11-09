<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Existing Database Mapping

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. What the "database" actually is

The legacy system has no database. Its entire state is **118 Google Sheets tabs**
inside one spreadsheet, accessed through `SpreadsheetApp`. Consequences that shape the migration:

- **No types.** Every cell is a string or number as formatted by Sheets. Currency, dates and
  booleans are parsed at read time by `Utilities` helpers.
- **No referential integrity.** `LeadID` in `Surveys` is a string that may or may not match a row
  in `Leads`. Nothing prevents orphans.
- **No transactions.** Multi-sheet writes (e.g. quotation + items + version snapshot) are separate
  `setValues` calls; a failure midway leaves partial state.
- **Row position is identity.** Many lookups resolve a record by its row index, so sorting or
  deleting a row silently re-points references.
- **No tenant dimension.** One spreadsheet = one organisation.

## 2. Physical tabs and their columns

118 tab schemas holding 1,955 columns in total.

| Sheet tab | APP.SHEETS enum key | Columns | Column names |
|---|---|---|---|
| `Settings` | `SETTINGS` | 3 | Key, Value, Description |
| `Users` | `USERS` | 13 | UserID, Name, Mobile, Email, Role, Designation, Active, PinHash, CreatedAt, UpdatedAt, DOB, Photo, ReadAccess |
| `Sessions` | `SESSIONS` | 7 | SessionID, TokenHash, UserID, CreatedAt, ExpiresAtEpoch, LastSeenAt, Active |
| `Leads` | `LEADS` | 23 | LeadID, CreatedAt, CreatedBy, CustomerName, Company, Mobile, Email, Address, ServiceType, Source, Requirement, Status, NextFollowupAt, AssignedExecutiveID, SurveyID, CurrentQuotationID, LastActivityAt, CancelledReason, Active, Remarks, LeadType, MarketingSource, OtherEmails |
| `LeadFollowups` | `LEAD_FOLLOWUPS` | 9 | FollowupID, LeadID, CreatedAt, CreatedBy, Type, Outcome, Notes, NextFollowupAt, NewLeadStatus |
| `Surveys` | `SURVEYS` | 40 | SurveyID, LeadID, ExecutiveID, ScheduledDate, ScheduledTime, Status, SiteContact, SiteMobile, Address, InspectionSummary, ManpowerRequired, MaterialsRequired, AreaSqFt, ScopeOfWork, PhotosJSON, CompletedAt, CompletedBy, CreatedAt, UpdatedAt, CancelledReason, SiteName, ContactDesignation, SiteEmail, FacilityType, CarpetArea, Floors, Buildings, Occupancy, WorkingHours, WorkingDays, ShiftPattern, ServicesRequired, OtherService, ExistingAgency, CurrentManpower, ContractExpiry, ChangeReason, TransitionDate, RecommendationJSON, AdditionalRemarks |
| `Quotations` | `QUOTATIONS` | 48 | QuotationID, QuoteNumber, Revision, LeadID, SurveyID, Status, IssueDate, ValidUntil, CustomerName, Company, BillingAddress, ServiceType, Subtotal, TaxPercent, TaxAmount, GrandTotal, Terms, InternalNotes, PDFFileID, PDFUrl, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, SentAt, WonLostAt, Reason, ParentQuotationID, ProjectName, SiteLocation, ManagementFeeMode, ManagementFeeValue, ManagementFeeAmount, AmountBeforeTax, QuotationNotes, SalaryBreakupJSON, IncludeBreakupInQuotePdf, BreakupCompanyPdfFileID, BreakupCompanyPdfUrl, BreakupEmployeePdfFileID, BreakupEmployeePdfUrl, BreakupBothPdfFileID, BreakupBothPdfUrl, BreakupID, EmailMessageID, LostReason, LostCompetitor, LostCompetitorPrice |
| `QuoteItems` | `QUOTE_ITEMS` | 8 | ItemID, QuotationID, SortOrder, Description, Unit, Quantity, Rate, Amount |
| `QuotationFollowups` | `QUOTE_FOLLOWUPS` | 7 | QuoteFollowupID, QuotationID, CreatedAt, CreatedBy, Status, Notes, NextFollowupAt |
| `QuotationVersions` | `QUOTE_VERSIONS` | 7 | VersionID, QuotationID, Revision, SnapshotJSON, ChangedAt, ChangedBy, ChangeSummary |
| `Clients` | `CLIENTS` | 17 | ClientID, ClientCode, CompanyName, LegalName, GSTIN, BillingAddress, ServiceAddress, PrimaryEmail, PrimaryPhone, PaymentTerms, DriveFolderID, Status, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `ClientContacts` | `CLIENT_CONTACTS` | 13 | ContactID, ClientID, Department, Name, Designation, Mobile, Email, IsPrimary, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `ClientContracts` | `CLIENT_CONTRACTS` | 23 | ContractID, ClientID, QuotationID, QuoteNumber, QuoteRevision, ServiceType, ContractValue, StartDate, EndDate, PaymentTerms, Status, FinalQuotationSnapshotJSON, FinalPDFFileID, FinalPDFUrl, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active, SourceType, TenderID, TenderNo, TenderSnapshotJSON |
| `ClientDocuments` | `CLIENT_DOCUMENTS` | 13 | DocumentID, ClientID, ContractID, Category, FileName, MimeType, FileSize, DriveFileID, DriveUrl, Notes, UploadedAt, UploadedBy, Active |
| `Companies` | `COMPANIES` | 7 | CompanyID, CompanyCode, LegalName, DisplayName, Active, CreatedAt, UpdatedAt |
| `UserCompanyAccess` | `USER_COMPANY_ACCESS` | 8 | AccessID, UserID, CompanyID, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `Tenders` | `TENDERS` | 40 | TenderID, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, TenderNo, TenderTitle, Portal, PortalURL, Organization, Sector, Location, TenderFee, EMDAmount, BGAmount, AMCAmount, TenderValue, ManpowerCount, ContractYears, PostedDate, PreBidDate, SubmissionDate, OpeningDate, AssignedUserID, Status, NextFollowupAt, Scope, Eligibility, DocumentsRequired, DocumentsPending, Notes, ResultReason, Active, SecurityDepositPercent, SecurityDepositForm, TenureMonths, CompanyID, ChallanFileID, ChallanFileName, ChallanFileUrl |
| `TenderFollowups` | `TENDER_FOLLOWUPS` | 10 | TenderFollowupID, TenderID, CreatedAt, CreatedBy, Status, Notes, DocumentsPending, NextFollowupAt, AmountQuoted, ResultReason |
| `TenderOrders` | `TENDER_ORDERS` | 28 | TenderOrderID, TenderID, TenderNo, TenderTitle, Beneficiary, Portal, Location, OrderNumber, AwardDate, StartDate, EndDate, ContractValue, TenureMonths, PaymentTerms, Status, PrimaryContactName, PrimaryContactMobile, PrimaryContactEmail, DriveFolderID, FinalTenderSnapshotJSON, AssignedUserID, Remarks, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active, CompanyID |
| `TenderOrderContacts` | `TENDER_ORDER_CONTACTS` | 13 | OrderContactID, TenderOrderID, Department, Name, Designation, Mobile, Email, IsPrimary, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `TenderOrderDocuments` | `TENDER_ORDER_DOCUMENTS` | 12 | OrderDocumentID, TenderOrderID, Category, FileName, MimeType, FileSize, DriveFileID, DriveUrl, Notes, UploadedAt, UploadedBy, Active |
| `SDTracker` | `SD_TRACKER` | 29 | SDEntryID, TenderID, TenderOrderID, TenderNo, EntryType, Beneficiary, InstrumentNo, Amount, IssuingDate, BankName, ExpiryDate, ContractEndDate, DLPEndDate, Status, Remarks, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active, CompanyID, PaymentRef, PaymentDate, PaymentMethod, PaidBy, PaidAt, ReceiptFileID, ReceiptFileName, ReceiptFileUrl |
| `UserNotes` | `USER_NOTES` | 7 | NoteID, UserID, Username, NoteText, CreatedAt, UpdatedAt, Active |
| `ChatMessages` | `CHAT_MESSAGES` | 6 | MessageID, UserID, Username, MessageText, CreatedAt, Active |
| `ChatReadState` | `CHAT_READ_STATE` | 4 | UserID, LastReadAt, LastReadMessageID, UpdatedAt |
| `EmailTemplates` | `EMAIL_TEMPLATES` | 11 | TemplateID, Name, Subject, DriveFileID, HtmlSize, Source, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `EmailRecipients` | `EMAIL_RECIPIENTS` | 8 | RecipientID, Name, Email, Notes, Source, CreatedAt, CreatedBy, Active |
| `SalaryBreakups` | `SALARY_BREAKUPS` | 15 | BreakupID, CustomerName, BreakupJSON, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, CustomerSource, Side, CompanyPdfFileID, CompanyPdfUrl, EmployeePdfFileID, EmployeePdfUrl, BothPdfFileID, BothPdfUrl |
| `WonHandovers` | `WON_HANDOVERS` | 21 | HandoverID, SourceType, SourceID, CustomerName, POContractNo, ContractStart, ContractEnd, PaymentTerms, ScopeOfWork, ContactJSON, ManpowerJSON, BreakupID, AwardDocFileID, AwardDocName, OpsSentAt, AccountsSentAt, HrSentAt, CC, SentBy, CreatedAt, UpdatedAt |
| `DailyReports` | `DAILY_REPORTS` | 10 | ReportID, UserID, ReportDate, Role, CountsJSON, WorkNotes, TomorrowPlan, PendingNotes, CreatedAt, UpdatedAt |
| `AuditLog` | `AUDIT` | 7 | AuditID, Timestamp, UserID, Action, EntityType, EntityID, DetailsJSON |
| `EmailDirectory` | `EMAIL_DIRECTORY` | 53 | EmailID, DisplayName, Domain, CompanyName, SourceMailboxes, FirstSeenAt, LastSeenAt, SentCount, ReceivedCount, TotalEmails, LinkedLeadID, LinkedClientID, Tags, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active, FirstName, LastName, Designation, Department, Industry, City, State, Country, Phone, Website, MarketingStatus, ConsentStatus, OptOutAt, SuppressionReason, OwnerUserID, InternalFlag, CompanyDerived, SourceProvider, CcCount, LastMessageAt, MergedInto, ConvertedLeadID, WhatsApp, CompanySize, Area, ServiceInterest, LastEmailSentAt, LastEmailOpenedAt, LastEmailClickedAt, BounceStatus, BounceAt, UnsubscribedAt, EngagementScore, LastCampaignID |
| `EmailDirectoryEdges` | `EMAIL_DIRECTORY_EDGES` | 12 | EdgeID, FromEmailID, ToEmailID, SourceMailbox, Direction, MessageDate, SubjectSnippet, MessageCount, FirstSeenAt, LastSeenAt, CreatedAt, Active |
| `MarketingMailboxes` | `MARKETING_MAILBOXES` | 19 | MailboxID, Provider, AuthType, EmailAddress, DisplayName, Status, LastSyncAt, LastSyncCursor, MessagesScanned, ContactsFound, LastError, ConnectedBy, ConnectedAt, DisconnectedAt, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `MarketingSources` | `MARKETING_SOURCES` | 13 | SourceID, EmailID, MailboxID, Provider, Folder, SourceMailbox, FirstSeenAt, LastSeenAt, MessageCount, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `MarketingSyncJobs` | `MARKETING_JOBS` | 23 | JobID, MailboxID, SourceMailbox, Provider, StartedAt, CompletedAt, DateFrom, DateTo, FolderSelection, IncludeCC, FullResync, Phase, SliceStartMs, MessagesScanned, ContactsFound, NewContacts, UpdatedContacts, DuplicatesRemoved, InternalExcluded, SystemExcluded, Status, ErrorMessage, CreatedBy |
| `MarketingSegments` | `MARKETING_SEGMENTS` | 12 | SegmentID, Name, Description, Type, FilterJSON, StaticMembersJSON, Notes, CreatedBy, CreatedAt, UpdatedAt, UpdatedBy, Active |
| `MarketingSuppression` | `MARKETING_SUPPRESSION` | 12 | SuppressionID, EmailID, Name, Company, Reason, Notes, Source, AddedAt, AddedBy, RemovedAt, RemovedBy, Active |
| `SocialPosts` | `SOCIAL_POSTS` | 33 | PostID, Title, Service, CustomService, Objective, Topic, Headline, MasterCaption, ShortCaption, CTA, Hashtags, ImageConcept, AiInstruction, AiTone, AiLength, AiLanguage, AiGenerationID, CreativeMediaID, CreativeLayoutJSON, TemplateID, Status, ApprovalStatus, ApprovalNote, Timezone, ScheduledAt, PublishedAt, Notes, CreatedBy, ApprovedBy, CreatedAt, UpdatedAt, UpdatedBy, Active |
| `SocialPostPlatforms` | `SOCIAL_POST_PLATFORMS` | 24 | PlatformPostID, PostID, Platform, AccountID, Caption, Status, ScheduledAt, PublishedAt, ExternalPostID, ExternalPostURL, ErrorMessage, Attempts, NextAttemptAt, MediaID, Impressions, Reach, Likes, Comments, Shares, Clicks, AnalyticsAt, CreatedAt, UpdatedAt, Active |
| `SocialAccounts` | `SOCIAL_ACCOUNTS` | 18 | AccountID, Platform, AccountName, ExternalAccountID, AccountType, Status, AuthType, Scopes, TokenExpiresAt, PageRefJSON, ConnectedBy, ConnectedAt, LastSyncAt, LastPublishAt, LastError, CreatedAt, UpdatedAt, Active |
| `SocialPublishLogs` | `SOCIAL_PUBLISH_LOGS` | 14 | LogID, PostID, PlatformPostID, Platform, AccountID, Attempt, Trigger, RequestStatus, ResponseStatus, ExternalPostID, ErrorDetail, StartedAt, CompletedAt, CreatedBy |
| `SocialTemplates` | `SOCIAL_TEMPLATES` | 16 | TemplateID, Name, Service, Objective, Headline, CaptionStructure, CTA, Hashtags, CreativeLayoutJSON, Platform, Language, BuiltIn, CreatedBy, CreatedAt, UpdatedAt, Active |
| `SocialMedia` | `SOCIAL_MEDIA` | 16 | MediaID, FileName, MimeType, Width, Height, SizeBytes, DriveFileID, PublicURL, Source, Tags, Category, AiGenerationID, CreatedBy, CreatedAt, UpdatedAt, Active |
| `SocialAiLog` | `SOCIAL_AI_LOG` | 14 | GenerationID, UserID, ContentType, Prompt, Service, Platform, Language, Tone, ResultJSON, Provider, Model, Decision, DecisionAt, CreatedAt |
| `EmailAccounts` | `EMAIL_ACCOUNTS` | 20 | AccountID, Provider, Label, EmailAddress, DisplayName, Status, SendEnabled, OwnerUserID, AllowedUsersJSON, DefaultSenderName, LastUsedAt, LastError, ConnectedBy, ConnectedAt, DisconnectedAt, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `EmailCampaigns` | `EMAIL_CAMPAIGNS` | 39 | CampaignID, Name, Description, Category, Subject, Preheader, SenderName, SenderEmail, ReplyTo, AccountID, Status, ApprovalNote, BodyHTML, BodyJSON, TemplateID, AudienceJSON, RecipientCount, ValidCount, ScheduledAt, ScheduledTimezone, StartedAt, CompletedAt, SentCount, DeliveredCount, OpenedCount, ClickedCount, BouncedCount, FailedCount, UnsubCount, TrackOpens, TrackClicks, QualityJSON, AiPrompt, CreatedByName, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `EmailCampaignRecipients` | `EMAIL_RECIPIENTS` | 20 | RowID, CampaignID, EmailID, Email, Name, Company, Status, SkipReason, Provider, ProviderMessageID, Attempts, LastAttemptAt, NextRetryAt, LastError, SentAt, OpenedAt, ClickedAt, BouncedAt, UnsubscribedAt, CreatedAt |
| `EmailMktTemplates` | `EMAIL_MKT_TEMPLATES` | 17 | TemplateID, Name, Category, Description, Subject, Preheader, BodyJSON, BodyHTML, Version, HistoryJSON, Favorite, BuiltIn, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `CreativeProjects` | `CREATIVE_PROJECTS` | 25 | ProjectID, Name, UserID, UserName, Service, CustomService, Purpose, Platform, Width, Height, TemplateID, Status, CampaignID, Tags, ScheduledAt, ThumbData, AssetID, LayersJSON, CopyJSON, InputsJSON, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `CreativeAssets` | `CREATIVE_ASSETS` | 17 | AssetID, ProjectID, Type, DriveFileID, PublicURL, ThumbData, MetadataJSON, Provider, Model, Seed, Width, Height, GenerationID, FileName, CreatedAt, CreatedBy, Active |
| `CreativeGenerations` | `CREATIVE_GENERATIONS` | 18 | GenerationID, ProjectID, Provider, Model, Prompt, ImprovedPrompt, NegativePrompt, Seed, Width, Height, Count, GenerationTime, Status, ErrorMessage, CostEstimate, RequestID, CreatedAt, CreatedBy |
| `CreativeTemplates` | `CREATIVE_TEMPLATES` | 13 | TemplateID, Name, Category, Width, Height, TemplateJSON, PreviewThumb, BuiltIn, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `CreativeCampaigns` | `CREATIVE_CAMPAIGNS` | 10 | CampaignID, Name, Description, StartDate, EndDate, Status, CreatedBy, CreatedAt, UpdatedAt, Active |
| `CreativeErrorLogs` | `CREATIVE_LOGS` | 8 | LogID, Provider, HTTPStatus, ErrorDetail, RequestID, UserID, Action, CreatedAt |
| `EmailMktLists` | `EMAIL_LISTS` | 10 | ListID, Name, Description, Status, ContactCount, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `EmailMktListMembers` | `EMAIL_LIST_MEMBERS` | 6 | MemberID, ListID, EmailID, AddedAt, AddedBy, Active |
| `EmailEvents` | `EMAIL_EVENTS` | 10 | EventID, CampaignID, EmailID, Email, Type, LinkID, URL, Provider, Detail, At |
| `EmailLinkStats` | `EMAIL_LINKS` | 7 | LinkID, CampaignID, URL, Label, Clicks, UniqueClicks, UpdatedAt |
| `Invoices` | ⚠️ *literal only* | 24 | InvoiceID, ClientID, ClientName, TenderOrderID, TenderNo, InvoiceNo, InvoiceDate, DueDate, PeriodFrom, PeriodTo, SubTotal, TaxPercent, TaxAmount, TotalAmount, PaidAmount, Status, Notes, PDFFileID, PDFUrl, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `InvoiceItems` | ⚠️ *literal only* | 11 | InvoiceItemID, InvoiceID, SortOrder, Description, HSNCode, Quantity, Unit, Rate, TaxPercent, Amount, CreatedAt |
| `InvoicePayments` | ⚠️ *literal only* | 18 | PaymentID, InvoiceID, ClientID, ReceivedDate, Amount, Mode, ReferenceNo, BankName, Notes, ReceivedBy, ApprovalStatus, ApprovedBy, ApprovedAt, RejectedBy, RejectedAt, RejectReason, CreatedAt, Active |
| `WorkingSheets` | ⚠️ *literal only* | 18 | WorkingSheetID, ClientID, ClientName, TenderOrderID, Month, Year, Status, TotalAmount, SubmittedBy, SubmittedAt, ApprovedBy, ApprovedAt, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `WorkingSheetItems` | ⚠️ *literal only* | 19 | LineID, WorkingSheetID, EmployeeID, EmployeeName, Designation, DaysWorked, Basic, DA, HRA, OT, Bonus, OtherAllowances, GrossEarnings, ESI, PF, PT, TotalDeductions, NetPay, SortOrder |
| `VendorBills` | ⚠️ *literal only* | 24 | VendorBillID, VendorID, VendorName, BillNo, BillDate, DueDate, SubTotal, CGSTAmount, SGSTAmount, IGSTAmount, TDSAmount, TaxPercent, TotalAmount, PaidAmount, Status, TenderOrderID, Notes, PDFFileID, PDFUrl, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `VendorBillItems` | ⚠️ *literal only* | 14 | VendorBillItemID, VendorBillID, SortOrder, Description, HSNCode, Quantity, Unit, Rate, TaxPercent, CGSTAmount, SGSTAmount, IGSTAmount, Amount, CreatedAt |
| `VendorPayments` | ⚠️ *literal only* | 21 | VendorPaymentID, VendorBillID, VendorID, VendorName, PaidDate, GrossAmount, TDSAmount, NetPaidAmount, Mode, ReferenceNo, BankAccount, Notes, ApprovalStatus, ApprovedBy, ApprovedAt, RejectedBy, RejectedAt, RejectReason, CreatedBy, CreatedAt, Active |
| `BankAccounts` | ⚠️ *literal only* | 16 | BankAccountID, Name, Type, BankName, AccountNo, IFSC, Branch, OpeningBalance, CurrentBalance, IsDefault, Active, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `JournalEntries` | ⚠️ *literal only* | 14 | JournalID, EntryDate, AccountID, AccountName, EntryType, ReferenceType, ReferenceID, ReferenceNo, Description, Debit, Credit, CreatedAt, CreatedBy, Active |
| `ManagementApprovals` | ⚠️ *literal only* | 15 | ApprovalID, ApprovalType, ReferenceType, ReferenceID, Amount, Status, RequestedBy, RequestedAt, ApprovedBy, ApprovedAt, RejectedBy, RejectedAt, RejectReason, Notes, Active |
| `Employees` | `EMPLOYEES` | 46 | EmployeeID, EmployeeCode, Name, FatherName, DOB, Gender, BloodGroup, MaritalStatus, Mobile, AlternateMobile, Email, AadhaarNo, PANNo, UANNo, ESINo, PFNo, BankAccountNo, BankName, IFSC, Branch, AddressPermanent, AddressCurrent, PhotoURL, Designation, Department, DateOfJoining, DateOfLeaving, Status, Site, ClientID, TenderOrderID, Basic, HRA, DA, OT, OtherAllowances, ESIApplicable, PFApplicable, PTState, EmergencyContactName, EmergencyContactMobile, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `EmployeeDocuments` | `EMPLOYEE_DOCUMENTS` | 13 | DocumentID, EmployeeID, Category, FileName, MimeType, FileSize, DriveFileID, DriveUrl, ExpiryDate, Notes, UploadedAt, UploadedBy, Active |
| `SalarySlips` | `SALARY_SLIPS` | 28 | SalarySlipID, SlipNumber, EmployeeID, EmployeeName, Month, Year, DaysWorked, DaysPresent, Basic, DA, HRA, SpecialAllowance, OTAmount, Bonus, GrossEarnings, ESIEmployee, PFEmployee, PT, TDS, TotalDeductions, NetPay, Status, PDFFileID, PDFUrl, SlipPDFGeneratedAt, GeneratedAt, GeneratedBy, Active |
| `PayrollRuns` | `PAYROLL_RUNS` | 25 | PayrollRunID, RunNumber, Month, Year, Status, TotalEmployees, TotalGross, TotalESI, TotalPF, TotalPT, TotalTDSDeducted, TotalDeductions, TotalNet, ProcessedBy, ProcessedAt, ApprovedBy, ApprovedAt, DisbursedAt, BankFileID, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `PayrollRunItems` | `PAYROLL_RUN_ITEMS` | 22 | PayrollRunItemID, PayrollRunID, EmployeeID, EmployeeName, Designation, DaysWorked, Basic, DA, HRA, SpecialAllowance, OTAmount, Bonus, GrossEarnings, ESIEmployee, PFEmployee, PT, TDS, TotalDeductions, NetPay, Status, PaymentRef, SortOrder |
| `ESIRegister` | `ESI_REGISTER` | 18 | ESIRegisterID, RegisterNumber, Month, Year, TotalEmployees, TotalGrossSalary, EmployerContributionRate, EmployerContribution, EmployeeContributionRate, EmployeeContribution, TotalContribution, FileID, FiledDate, ChallanNo, Notes, CreatedAt, CreatedBy, Active |
| `PFRegister` | `PF_REGISTER` | 22 | PFRegisterID, RegisterNumber, Month, Year, TotalEmployees, TotalEPFWages, EmployerShareEPFRate, EmployerShareEPF, EmployerShareEPSRate, EmployerShareEPS, EmployerShareEDLISRate, EmployerShareEDLIS, EmployeeShareEPFRate, EmployeeShareEPF, TotalContribution, FileID, FiledDate, UANGenerated, Notes, CreatedAt, CreatedBy, Active |
| `Assets` | `ASSETS` | 23 | AssetID, AssetCode, AssetName, Category, Brand, Model, SerialNo, PurchaseDate, PurchaseValue, Vendor, WarrantyExpiry, AssignedToType, AssignedToID, AssignedFromDate, AssignedToName, Status, Location, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `AssetHistory` | `ASSET_HISTORY` | 11 | HistoryID, AssetID, AssignedToType, AssignedToID, AssignedToName, AssignedFrom, AssignedTo, ReturnedOn, Notes, CreatedBy, Active |
| `StockItems` | `STOCK_ITEMS` | 16 | StockItemID, ItemCode, ItemName, Category, Unit, MinStockLevel, ReorderQty, UnitCost, VendorID, VendorName, Active, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `StockPurchases` | `STOCK_PURCHASES` | 13 | StockPurchaseID, PurchaseNumber, PurchaseDate, VendorID, VendorName, PurchaseOrderID, InvoiceNo, TotalAmount, ReceivedBy, Notes, CreatedAt, CreatedBy, Active |
| `StockPurchaseItems` | `STOCK_PURCHASE_ITEMS` | 8 | StockPurchaseItemID, StockPurchaseID, StockItemID, ItemName, Quantity, UnitCost, Amount, CreatedAt |
| `StockDistributions` | `STOCK_DISTRIBUTIONS` | 20 | StockDistributionID, ChallanNumber, DistributionDate, IssuedToType, IssuedToID, IssuedToName, SiteType, SiteID, SiteName, IssuedBy, Purpose, TotalItems, AcknowledgedAt, AcknowledgedBy, DeliveryChallanID, AcknowledgementToken, Notes, CreatedAt, CreatedBy, Active |
| `StockDistributionItems` | `STOCK_DISTRIBUTION_ITEMS` | 10 | StockDistributionItemID, StockDistributionID, StockItemID, ItemName, Quantity, UtilizedQty, ReturnQty, ReturnReason, Notes, CreatedAt |
| `Vendors` | `VENDORS` | 20 | VendorID, VendorCode, VendorName, ContactPerson, Mobile, Email, Address, GSTIN, PANNo, BankName, BankAccountNo, IFSC, Categories, Status, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `PurchaseOrders` | `PURCHASE_ORDERS` | 24 | PurchaseOrderID, PONumber, PODate, VendorID, VendorName, ExpectedDeliveryDate, Status, SubTotal, TaxAmount, TotalAmount, IndentID, PurchaseRequestID, ApprovedBy, ApprovedAt, PaymentStatus, PaymentDate, PaymentReference, PaymentNotes, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `PurchaseOrderItems` | `PURCHASE_ORDER_ITEMS` | 10 | POItemID, PurchaseOrderID, StockItemID, ItemName, Quantity, Unit, UnitCost, TaxPercent, Amount, SortOrder |
| `Indents` | `INDENTS` | 19 | IndentID, IndentNumber, IndentDate, NeededByDate, Status, Title, Purpose, TotalItems, ApprovedBy, ApprovedAt, RejectedBy, RejectedAt, RejectReason, LinkedPRID, ApprovalToken, CreatedBy, CreatedAt, UpdatedAt, Active |
| `PurchaseRequests` | `PURCHASE_REQUESTS` | 22 | PurchaseRequestID, PRNumber, PRDate, Status, Title, IndentID, VendorQuotesJSON, SelectedVendorID, SelectedVendorName, SelectedQuoteAmount, SelectedLeadDays, ApprovedBy, ApprovedAt, RejectedBy, RejectedAt, RejectReason, LinkedPOID, ApprovalToken, CreatedBy, CreatedAt, UpdatedAt, Active |
| `TenderAIMeta` | `TENDER_AI_META` | 16 | TenderAIMetaID, TenderID, CompanyID, TenderCategory, ApplicationStatus, AIAnalysisStatus, AIAnalysisID, ChecklistTotal, ChecklistDone, AIEnabled, LastAnalyzedAt, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `WageRateSets` | `WAGE_RATE_SETS` | 20 | RateSetID, Regime, Region, Title, NotificationRef, NotificationDate, EffectiveFrom, EffectiveTo, Status, Components, Notes, SourceFileID, SourceFileName, ConfirmedAt, ConfirmedBy, Active, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `WageRates` | `WAGE_RATES` | 21 | RateID, RateSetID, Regime, Zone, Sector, Category, Designation, Basic, VDA, Total, Per, HoursPerDay, ServiceLine, SourceDocument, SourcePage, CategoryInferred, Active, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `WageZoneMap` | `WAGE_ZONE_MAP` | 11 | MapID, Regime, Zone, MatchText, Confidence, Notes, Active, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `WageNotifications` | `WAGE_NOTIFICATIONS` | 19 | NotificationID, RateSetID, Regime, Sector, Zone, Title, NotificationRef, NotificationDate, FileID, FileName, MimeType, FileSize, Status, Remarks, Active, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `SalaryAreas` | `SALARY_AREAS` | 10 | AreaID, AreaName, State, Region, Status, Notes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `SalaryCategories` | `SALARY_CATEGORIES` | 8 | CategoryID, CategoryName, SortOrder, Status, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `TakeHomeSalary` | `TAKE_HOME_SALARY` | 11 | SalaryID, AreaID, AreaName, CategoryID, CategoryName, Salary, Status, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy |
| `TakeHomeSalaryHistory` | `SALARY_HISTORY` | 12 | HistoryID, SalaryID, AreaID, AreaName, CategoryID, CategoryName, PreviousSalary, NewSalary, UpdateSource, BatchID, UpdatedBy, UpdatedAt |
| `TenderDocuments` | `TENDER_DOCUMENTS` | 17 | TenderDocumentID, TenderID, DocType, FileName, MimeType, FileSize, DriveFileID, DriveUrl, UploadedAt, UploadedBy, TextExtractStatus, TextExtractFileID, TextExtractChars, OCRUsed, ParseError, SourceArchive, Active |
| `TenderAnalyses` | `TENDER_ANALYSES` | 25 | AnalysisID, TenderID, RunNumber, Status, Provider, Model, PromptVersion, JobStateJSON, ChunksTotal, ChunksDone, InputChars, PromptTokens, CompletionTokens, TokensTotal, ResultJSON, ResultFileID, ValidationStatus, ConflictCount, ErrorMessage, StartedAt, CompletedAt, RunBy, RetryCount, CreatedAt, Active |
| `TenderAIDates` | `TENDER_AI_DATES` | 14 | TenderAIDateID, TenderID, AnalysisID, DateType, Label, DateValue, RawText, SourceDocument, SourcePage, Confidence, UserEdited, VerifiedBy, VerifiedAt, Active |
| `TenderRequiredDocuments` | `TENDER_REQUIRED_DOCS` | 20 | TenderRequiredDocID, TenderID, AnalysisID, DocName, Category, Mandatory, RequirementDescription, SourceDocument, SourcePage, RequirementClass, MatchedCompanyDocumentID, MatchStatus, MatchConfidence, MatchNotes, Status, Remarks, UserEdited, VerifiedBy, VerifiedAt, Active |
| `TenderEligibilityCriteria` | `TENDER_ELIGIBILITY` | 18 | CriterionID, TenderID, AnalysisID, CriterionType, RequirementText, RequirementValue, SourceDocument, SourcePage, CompanyValue, CompanySource, SupportingDocumentID, Result, IsMandatory, Remarks, UserEdited, VerifiedBy, VerifiedAt, Active |
| `TenderChecklistItems` | `TENDER_CHECKLIST` | 22 | ChecklistItemID, TenderID, AnalysisID, TaskName, Category, Mandatory, Status, AssignedUserID, DueDate, CompletedAt, CompletedBy, Source, RelatedRequiredDocID, Remarks, SortOrder, VerifiedBy, VerifiedAt, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `TenderClarifications` | `TENDER_CLARIFICATIONS` | 15 | ClarificationID, TenderID, AnalysisID, QuestionText, Context, SourceDocument, SourcePage, Status, ResponseText, RaisedAt, RaisedBy, RespondedAt, RespondedBy, Notes, Active |
| `TenderBOQItems` | `TENDER_BOQ_ITEMS` | 16 | BOQItemID, TenderID, AnalysisID, SourceDocument, SourceSheet, SortOrder, ItemCode, Description, Unit, Quantity, RateFromTender, AmountFromTender, Currency, Remarks, ExtractedAt, Active |
| `CompanyDocuments` | `COMPANY_DOCUMENTS` | 21 | CompanyDocumentID, CompanyID, DocumentName, Category, FileName, MimeType, FileSize, DriveFileID, DriveUrl, IssueDate, ExpiryDate, Version, Status, Remarks, VerifiedBy, VerifiedAt, UploadedAt, UploadedBy, UpdatedAt, UpdatedBy, Active |
| `Moms` | `MOMS` | 30 | MomID, MomNumber, MeetingDate, MeetingTime, MeetingType, MeetingMode, ClientID, ClientName, LeadID, TenderOrderID, SiteName, SiteAddress, Subject, Purpose, ConductedBy, OrganizerID, DiscussionHtml, Status, TemplateID, PdfFileID, PdfUrl, FinalizedAt, FinalizedBy, ArchivedAt, ArchivedBy, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `MomParticipants` | `MOM_PARTICIPANTS` | 12 | ParticipantID, MomID, ParticipantType, UserID, ContactID, Name, Designation, Company, Email, Phone, SortOrder, Active |
| `MomAgenda` | `MOM_AGENDA` | 5 | AgendaID, MomID, AgendaItem, SortOrder, Active |
| `MomDecisions` | `MOM_DECISIONS` | 5 | DecisionID, MomID, Decision, SortOrder, Active |
| `MomActionItems` | `MOM_ACTIONS` | 18 | ActionID, MomID, ActionItem, Description, AssignedTo, Department, Priority, DueDate, Status, Remarks, CompletedAt, CompletedBy, FollowupID, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `MomAttachments` | `MOM_ATTACHMENTS` | 10 | AttachmentID, MomID, FileName, MimeType, FileSize, DriveFileID, DriveUrl, UploadedAt, UploadedBy, Active |
| `MomTemplates` | `MOM_TEMPLATES` | 10 | TemplateID, Name, MeetingType, AgendaJSON, DiscussionHtml, DecisionsJSON, ActionDefaultsJSON, Active, CreatedAt, CreatedBy |
| `Complaints` | `COMPLAINTS` | 20 | ComplaintID, ClientID, ClientName, ReceivedAt, Channel, RaisedBy, RaisedByContact, Category, Priority, Description, AssignedTo, AcknowledgedAt, ClosedAt, ClosureNote, Status, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, Active |
| `LoginHistory` | `LOGIN_HISTORY` | 7 | EventID, Timestamp, UserID, UserName, Identifier, Result, Detail |
| `SalesTargets` | `SALES_TARGETS` | 6 | TargetID, Month, UserID, TargetValue, UpdatedAt, UpdatedBy |
| `ClientWageProfiles` | `CLIENT_WAGE_PROFILES` | 6 | ClientID, Regime, Zone, Sector, UpdatedAt, UpdatedBy |

## 3. Column-type inference rules

Because Sheets stores everything as text, the migration importer must infer types. The mapping
is deterministic and is implemented in `migration/import-scripts`:

| Column-name pattern | PostgreSQL type | Transform |
|---|---|---|
| `*ID`, `*No`, `*Code`, `TenderNo`, `QuoteNumber` | text (with per-tenant unique index) | trim; preserve exact legacy value |
| `CreatedAt`, `UpdatedAt`, `*Date`, `*At`, `ScheduledDate` | timestamptz | parse with `Asia/Kolkata`; reject ambiguous |
| `Amount`, `Total`, `Value`, `Rate`, `Subtotal`, `Tax`, `Paid`, `Salary`, `Gross`, `Net` | numeric(14,2) | strip ₹ / commas; reject non-numeric; keep sign |
| `Percent`, `Pct`, `%Rate` | numeric(6,3) | strip `%` |
| `Active`, `IsPrimary`, `Enabled` | boolean | TRUE/FALSE, Y/N, 1/0, blank→false |
| `Email(s)`, `*Email`, `EmailID` | citext-ish text | lowercase; validate; multi-address split into child table |
| `Mobile`, `Phone`, `*Mobile` | text | keep leading 0 and country code; E.164 in a derived column |
| `*JSON` | jsonb | parse or quarantine |
| `DriveFileID`, `PDFFileID`, `*Url` | text + object-storage key | record legacy reference; file bytes copied separately |

## 4. Target PostgreSQL structure (summary)

Every tenant-owned table carries `tenant_id` with a foreign key to `tenants` and a row-level
security policy. The full DDL is in `packages/database/prisma/schema.prisma`.

| Legacy sheet group | Target tables | Notes |
|---|---|---|
| Settings | `tenant_settings`, `feature_flags` | Key/value becomes typed columns plus a settings JSONB for open-ended keys |
| Users / Sessions / LoginHistory | `users`, `sessions`, `login_history`, `user_roles`, `roles`, `permissions` | PIN → Argon2id password. Sessions become server-side records with rotation. |
| Leads / LeadFollowups | `leads`, `lead_followups` | Lead is tender-independent (Part 4 §G) |
| Surveys | `surveys`, `survey_items`, `survey_attachments` | Photos move to object storage |
| Quotations / QuoteItems / QuotationVersions / QuotationFollowups | `quotations`, `quotation_items`, `quotation_versions`, `quotation_followups`, `quotation_wage_breakup` | Money as numeric; revisions keep immutable snapshots |
| Clients / ClientContacts / ClientContracts / ClientDocuments | `clients`, `client_contacts`, `contracts`, `documents` | Documents unified into one table with polymorphic owner |
| Companies / UserCompanyAccess | `companies`, `user_company_access` | Companies gain `tenant_id`; branches/sites are new |
| Tenders / TenderFollowups / TenderOrders / SD tracker | `tenders`, `tender_followups`, `tender_orders`, `security_deposits` | `TenderID` preserved verbatim as `legacy_tender_id` |
| TenderAI group (13 sheets) | `ai_tenders`, `tender_documents`, `tender_analyses`, `tender_requirements`, `tender_boq_items`, … | Large nested JSON blobs become typed child tables where queried |
| Wage group (WageRateSets / WageRates / WageZoneMap / SalaryAreas / SalaryCategories / TakeHomeSalary / SalaryHistory) | `wage_rate_sets`, `wage_rates`, `wage_zones`, `salary_areas`, `salary_categories`, `take_home_salary` | **Effective-dated** (valid_from/valid_to) — the core fix for Part 5 §K |
| Employees / EmployeeDocuments / SalarySlips / PayrollRuns / PayrollRunItems / ESIRegister / PFRegister | `employees`, `employee_documents`, `payslips`, `payroll_runs`, `payroll_run_lines`, `statutory_registers` | Payroll runs get a lock state and maker/checker columns |
| Accounts group (11 literal-only sheets + Invoice ids) | `invoices`, `invoice_items`, `invoice_payments`, `working_sheets`, `vendor_bills`, `vendor_payments`, `bank_accounts`, `journal_entries` | These are the 11 tabs missing from the enum |
| Assets group | `assets`, `asset_allocations`, `asset_maintenance`, `stock_items`, `stock_movements`, `vendors`, `purchase_orders`, `indents` |  |
| Marketing / Email / Social groups | `email_accounts`, `email_campaigns`, `email_events`, `social_accounts`, `social_posts`, `social_publish_logs`, … | OAuth tokens encrypted at rest |
| AiLog / Creative groups | `ai_usage`, `creative_projects`, `creative_assets`, `creative_generations` | Usage metering feeds Part 5 subscription limits |
| Moms group (7 sheets) | `meetings`, `meeting_participants`, `meeting_decisions`, `meeting_action_items`, `meeting_attachments` | Additional module beyond Part 4 |
| AuditLog | `audit_logs` | Becomes append-only, tenant-scoped, with actor, IP, correlation id |

## 5. Identifier preservation policy (Part 9)

| Legacy identifier | Preserved as | Reason |
|---|---|---|
| `TenderID` / `TenderNo` (TND-…) | `tenders.legacy_tender_id` + `tenders.tender_no` (unique per tenant) | Part 4 §G requires the TND-style numbering survive |
| `LeadID` | `leads.legacy_lead_id` | Referenced by surveys and quotations |
| `QuotationID` / `QuoteNumber` | `quotations.legacy_quotation_id` + `quotation_no` | Revision chain must stay intact |
| `EmployeeID` | `employees.employee_code` (unique per company) | Used on payslips and statutory registers |
| `ClientID` / `ClientCode` | `clients.legacy_client_id` + `client_code` | Printed on invoices |
| Sheet row number | **not preserved as identity** | Part 9 explicitly forbids it; row provenance is kept in `legacy_row_ref` for reconciliation only |

