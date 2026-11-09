import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query, Res, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, IsArray, ValidateNested, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  calculateInvoice, calculateVendorBill, caption2, recomputeInvoiceStatus, recomputeBillStatus,
  needsApproval, APPROVAL_THRESHOLD, journalDebitCredit, bankBalanceAfter, bucketAgeing, gstrSummary, profitLoss,
  buildInvoiceHtml, buildPurchaseOrderHtml, canTransitionPO
} from '@ufms/shared/finance/finance-rules';

// ---------- DTOs ----------

class InvoiceItemDto {
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(40) hsnCode?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsNumber() @Min(0) rate: number;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
}

class SaveInvoiceDto {
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsString() @MaxLength(200) clientName: string;
  @IsOptional() @IsString() tenderOrderId?: string;
  @IsOptional() @IsString() tenderNo?: string;
  @IsOptional() @IsString() invoiceNo?: string;
  @IsDateString() invoiceDate: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsDateString() periodFrom?: string;
  @IsOptional() @IsDateString() periodTo?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items: InvoiceItemDto[];
}

class ReceiptDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsString() mode: string;
  @IsOptional() @IsString() @MaxLength(80) referenceNo?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(120) bankAccountId?: string;
  @IsOptional() @IsDateString() receiptDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
}

class VendorBillItemDto {
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(40) hsnCode?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsNumber() @Min(0) rate: number;
  @IsNumber() @Min(0) taxPercent: number;
}

class SaveVendorBillDto {
  @IsOptional() @IsString() vendorBillId?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsString() @MaxLength(200) vendorName: string;
  @IsString() @MaxLength(80) billNo: string;
  @IsDateString() billDate: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() supplyType?: string;
  @IsOptional() @IsNumber() @Min(0) tdsPercent?: number;
  @IsOptional() @IsString() tenderOrderId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => VendorBillItemDto) items: VendorBillItemDto[];
}

class VendorPaymentDto {
  @IsNumber() @Min(0.01) grossAmount: number;
  @IsOptional() @IsNumber() @Min(0) tdsAmount?: number;
  @IsString() mode: string;
  @IsOptional() @IsString() @MaxLength(80) referenceNo?: string;
  @IsOptional() @IsString() @MaxLength(120) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsDateString() paidDate?: string;
}

class BankAccountDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) accountNo?: string;
  @IsOptional() @IsString() @MaxLength(20) ifsc?: string;
  @IsOptional() @IsString() @MaxLength(120) branch?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() isDefault?: boolean;
}

// helpers
const todayIso = () => new Date().toISOString().slice(0,10);
const toDate = (s?: string|null) => s ? new Date(s) : null;
const money = (v:any) => Math.round((Number(v)||0)*100)/100;

async function nextSeq(tx:any, table:string, col:string, tenantId:string, prefix:string): Promise<string>{
  const rows:any[] = await tx.$queryRawUnsafe(`SELECT "${col}" FROM "${table}" WHERE "tenantId" = $1::uuid AND "${col}" LIKE $2 ORDER BY "${col}" DESC LIMIT 1`, tenantId, `${prefix}%`);
  const last = rows[0]?.[col] as string|undefined;
  let n=1;
  if(last){
    const m = last.match(/(\d+)$/);
    if(m) n = parseInt(m[1],10)+1;
  }
  const pad=4;
  const base = `${prefix}-${String(n).padStart(pad,'0')}`;
  // ensure unique by checking existence; if collision, bump
  for(let i=0;i<10;i++){
    const exists = await tx.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE "tenantId"=$1::uuid AND "${col}"=$2 LIMIT 1`, tenantId, base.endsWith(String(n).padStart(pad,'0')) ? base : `${prefix}-${String(n+i).padStart(pad,'0')}`);
    if(!exists.length) return i===0? base : `${prefix}-${String(n+i).padStart(pad,'0')}`;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

@ApiTags('finance')
@Controller('api/v1')
export class FinanceController {
  constructor(private readonly prisma: PrismaService){}

  // ---------- Invoices ----------
  @Get('invoices')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  @ApiOperation({summary:'List invoices'})
  async listInvoices(@CurrentUser() u: AuthUser, @Query('status') status?:string, @Query('clientId') clientId?:string, @Query('search') search?:string, @Query('fromDate') fromDate?:string, @Query('toDate') toDateStr?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take = Math.min(100, Math.max(1, parseInt(pageSize,10)||25));
    const skip = (Math.max(1, parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={ deletedAt:null };
      if(status) where.status=status.toUpperCase();
      if(clientId) where.clientId=clientId;
      if(fromDate) where.invoiceDate={ gte: new Date(fromDate)};
      if(toDateStr) where.invoiceDate={ ...(where.invoiceDate||{}), lte: new Date(toDateStr)};
      if(search){
        const s=search.toLowerCase();
        where.OR=[{invoiceNo:{contains:s, mode:'insensitive'}},{clientName:{contains:s, mode:'insensitive'}},{tenderNo:{contains:s, mode:'insensitive'}}];
      }
      const [items,total] = await Promise.all([
        tx.invoice.findMany({where, orderBy:{invoiceDate:'desc'}, skip, take, include:{items:true, payments:{where:{approvalStatus:'APPROVED'}}} }),
        tx.invoice.count({where})
      ]);
      // enrich pending amount
      const enriched = await Promise.all(items.map(async inv=>{
        const pending = await tx.invoicePayment.aggregate({where:{invoiceId:inv.id, approvalStatus:'PENDING'}, _sum:{amount:true}});
        return {...inv, pendingReceiptAmount: Number(pending._sum.amount||0)};
      }));
      return {items:enriched, total, page:Number(page), pageSize:take};
    });
  }

  @Get('invoices/:id')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async getInvoice(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const inv = await tx.invoice.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}, payments:{orderBy:{receivedDate:'desc'}}}});
      if(!inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      return inv;
    });
  }

  @Post('invoices')
  @RequirePermission(PERMISSIONS.INVOICE_WRITE)
  async saveInvoice(@CurrentUser() u:AuthUser, @Body() dto:SaveInvoiceDto){
    if(!dto.items?.length) throw new BadRequestException({code:'NO_ITEMS', message:'At least one line item is required.'});
    if(!dto.clientName?.trim()) throw new BadRequestException({code:'CLIENT_REQUIRED', message:'Customer is required.'});
    const calc = calculateInvoice(dto.items.map(i=>({description:i.description, hsnCode:i.hsnCode, quantity:i.quantity, unit:i.unit, rate:i.rate, taxPercent:i.taxPercent})), dto.taxPercent);
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const invoiceId = dto.invoiceId?.trim() || null;
      let inv:any = null;
      if(invoiceId) inv = await tx.invoice.findFirst({where:{id:invoiceId, deletedAt:null}});
      const isNew = !inv;
      if(invoiceId && !inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      // cancel check: cannot edit cancelled? allow editing draft/sent etc but not cancelled paid? keep simple: forbid editing CANCELLED
      if(inv && String(inv.status)==='CANCELLED') throw new BadRequestException({code:'CANNOT_EDIT', message:'Cannot edit a cancelled invoice.'});

      // invoiceNo generation
      let invoiceNo = dto.invoiceNo?.trim();
      if(!invoiceNo){
        if(isNew){
          // INV-YYYY-NNNN
          const yr = new Date(dto.invoiceDate).getUTCFullYear();
          invoiceNo = await nextSeq(tx,'invoices','invoiceNo', u.tenantId, `INV-${yr}`);
        } else invoiceNo = inv.invoiceNo;
      } else {
        // uniqueness check
        const dup = await tx.invoice.findFirst({where:{tenantId:u.tenantId, invoiceNo, deletedAt:null, ...(isNew?{}:{NOT:{id:inv.id}})}});
        if(dup) throw new ConflictException({code:'DUPLICATE_INVOICE_NO', message:`Invoice number ${invoiceNo} already exists.`});
      }

      const data:any={
        clientId: dto.clientId || inv?.clientId || null,
        clientName: dto.clientName.trim(),
        tenderOrderId: dto.tenderOrderId || inv?.tenderOrderId || null,
        tenderNo: dto.tenderNo || inv?.tenderNo || null,
        invoiceNo,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : (inv?.periodFrom||null),
        periodTo: dto.periodTo ? new Date(dto.periodTo) : (inv?.periodTo||null),
        subTotal: calc.subtotal,
        taxPercent: calc.taxPercent,
        taxAmount: calc.taxAmount,
        totalAmount: calc.total,
        notes: dto.notes ?? inv?.notes ?? null,
        status: (dto.status?.toUpperCase() as any) || inv?.status || 'DRAFT',
        updatedById: u.id,
      };
      let savedId:string;
      if(isNew){
        const created = await tx.invoice.create({data:{
          ...data,
          id: undefined,
          tenantId: u.tenantId,
          paidAmount: 0,
          createdById: u.id,
        }});
        savedId = created.id;
      } else {
        // preserve paidAmount
        const updated = await tx.invoice.update({where:{id:inv.id}, data});
        savedId = updated.id;
        // replace items
        await tx.invoiceItem.deleteMany({where:{invoiceId:savedId}});
      }
      // create items
      for(let idx=0; idx<calc.items.length; idx++){
        const it = calc.items[idx];
        await tx.invoiceItem.create({data:{
          tenantId: u.tenantId,
          invoiceId: savedId,
          sortOrder: idx+1,
          description: it.description,
          hsnCode: it.hsnCode || null,
          quantity: it.quantity,
          unit: it.unit,
          rate: it.rate,
          taxPercent: it.taxPercent,
          amount: it.amount,
        }});
      }
      const result = await tx.invoice.findFirst({where:{id:savedId}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      return result;
    });
  }

  @Post('invoices/:id/cancel')
  @RequirePermission(PERMISSIONS.INVOICE_WRITE)
  async cancelInvoice(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const inv = await tx.invoice.findFirst({where:{id, deletedAt:null}});
      if(!inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      if(Number(inv.paidAmount)>0) throw new BadRequestException({code:'HAS_PAYMENTS', message:'Cannot cancel an invoice that has payments. Reverse the payments first.'});
      return tx.invoice.update({where:{id}, data:{status:'CANCELLED', updatedById:u.id}});
    });
  }

  @Post('invoices/:id/receipts')
  @RequirePermission(PERMISSIONS.INVOICE_WRITE)
  async recordReceipt(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() dto:ReceiptDto){
    const amount = Number(dto.amount);
    if(!(amount>0)) throw new BadRequestException({code:'INVALID_AMOUNT', message:'Receipt amount must be greater than zero.'});
    const refNo = (dto.referenceNo || dto.reference || dto.bankAccountId || `RCPT-${Date.now()}`).toString().trim();
    if(!refNo) throw new BadRequestException({code:'REF_REQUIRED', message:'Reference / transaction number is required.'});
    const bankNameVal = (dto.bankName || 'CASH').trim();
    if(!bankNameVal) throw new BadRequestException({code:'BANK_REQUIRED', message:'Bank name is required.'});
    const mode = String(dto.mode||'NEFT').toUpperCase();
    if(!['NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','CARD','OTHER'].includes(mode)) throw new BadRequestException({code:'INVALID_MODE', message:'Invalid payment mode.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const inv = await tx.invoice.findFirst({where:{id, deletedAt:null}});
      if(!inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      // duplicate ref check per tenant
      const dup = await tx.invoicePayment.findFirst({where:{tenantId:u.tenantId, referenceNo: refNo}});
      if(dup) throw new ConflictException({code:'DUPLICATE_REF', message:'A receipt with this reference number already exists.'});
      const needs = needsApproval(amount);
      const status = needs ? 'PENDING' : 'APPROVED';
      const rcptDate = dto.receiptDate || dto.receivedDate;
      const pay = await tx.invoicePayment.create({data:{
        tenantId: u.tenantId,
        invoiceId: id,
        clientId: inv.clientId,
        receivedDate: rcptDate ? new Date(rcptDate) : new Date(todayIso()),
        amount,
        mode: mode as any,
        referenceNo: refNo,
        bankName: bankNameVal,
        notes: dto.notes || null,
        receivedById: u.id,
        approvalStatus: status as any,
        approvedById: needs ? null : u.id,
        approvedAt: needs ? null : new Date(),
      }});
      if(needs){
        await tx.financeApproval.create({data:{
          tenantId:u.tenantId,
          approvalType:'ACCOUNTS_RECEIPT' as any,
          referenceType:'INVOICE_PAYMENT',
          referenceId: pay.id,
          amount,
          status:'PENDING' as any,
          requestedById: u.id,
          notes:`Receipt against ${inv.invoiceNo} from ${inv.clientName}`,
        }});
      } else {
        // post to journal
        const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
        if(bank){
          const {debit, credit} = journalDebitCredit('RECEIPT', amount);
          await tx.journalEntry.create({data:{
            tenantId:u.tenantId,
            entryDate: pay.receivedDate,
            accountId: bank.id,
            accountName: bank.name,
            entryType:'RECEIPT' as any,
            referenceType:'INVOICE_PAYMENT',
            referenceId: pay.id,
            referenceNo: `${inv.invoiceNo} / ${pay.referenceNo}`,
            description:`Receipt from ${inv.clientName} against ${inv.invoiceNo}`,
            debit, credit,
            createdById: u.id,
          }});
          await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance), 'RECEIPT', amount)}});
        }
        await this.recomputeInvoice(tx, id, todayIso());
      }
      return pay;
    });
  }

  @Post('receipts/:id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async approveReceipt(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const p = await tx.invoicePayment.findFirst({where:{id}});
      if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Receipt not found.'});
      if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Receipt is not pending approval.'});
      await tx.invoicePayment.update({where:{id}, data:{approvalStatus:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
      const inv = await tx.invoice.findFirst({where:{id:p.invoiceId}});
      const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
      if(bank && inv){
        const {debit,credit}=journalDebitCredit('RECEIPT', Number(p.amount));
        await tx.journalEntry.create({data:{
          tenantId:u.tenantId,
          entryDate: p.receivedDate,
          accountId:bank.id,
          accountName:bank.name,
          entryType:'RECEIPT' as any,
          referenceType:'INVOICE_PAYMENT',
          referenceId:p.id,
          referenceNo:`${inv.invoiceNo} / ${p.referenceNo}`,
          description:`Receipt from ${inv.clientName} against ${inv.invoiceNo}`,
          debit, credit,
          createdById:u.id,
        }});
        await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance),'RECEIPT', Number(p.amount))}});
      }
      if(inv) await this.recomputeInvoice(tx, inv.id, todayIso());
      const appr = await tx.financeApproval.findFirst({where:{referenceId:p.id, approvalType:'ACCOUNTS_RECEIPT' as any, active:true}});
      if(appr) await tx.financeApproval.update({where:{id:appr.id}, data:{status:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
      return {ok:true};
    });
  }

  @Post('receipts/:id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async rejectReceipt(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const p = await tx.invoicePayment.findFirst({where:{id}});
      if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Receipt not found.'});
      if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Receipt is not pending approval.'});
      await tx.invoicePayment.update({where:{id}, data:{approvalStatus:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason: String(body?.reason||'')}});
      const appr = await tx.financeApproval.findFirst({where:{referenceId:p.id, approvalType:'ACCOUNTS_RECEIPT' as any, active:true}});
      if(appr) await tx.financeApproval.update({where:{id:appr.id}, data:{status:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
      // recompute invoice (no paid change but clean)
      await this.recomputeInvoice(tx, p.invoiceId, todayIso());
      return {ok:true};
    });
  }

  // ---------- Vendor Bills ----------
  @Get('vendor-bills')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_READ)
  async listBills(@CurrentUser() u:AuthUser, @Query('status') status?:string, @Query('vendorId') vendorId?:string, @Query('search') search?:string, @Query('fromDate') fromDate?:string, @Query('toDate') toDateStr?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take = Math.min(100, Math.max(1, parseInt(pageSize,10)||25));
    const skip = (Math.max(1, parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={ deletedAt:null };
      if(status) where.status=status.toUpperCase();
      if(vendorId) where.vendorId=vendorId;
      if(fromDate) where.billDate={ gte: new Date(fromDate)};
      if(toDateStr) where.billDate={ ...(where.billDate||{}), lte: new Date(toDateStr)};
      if(search){
        const s=search.toLowerCase();
        where.OR=[{billNo:{contains:s, mode:'insensitive'}},{vendorName:{contains:s, mode:'insensitive'}}];
      }
      const [items,total]=await Promise.all([
        tx.vendorBill.findMany({where, orderBy:{billDate:'desc'}, skip, take, include:{items:true}}),
        tx.vendorBill.count({where})
      ]);
      return {items, total, page:Number(page), pageSize:take};
    });
  }

  @Get('vendor-bills/:id')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_READ)
  async getBill(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const b = await tx.vendorBill.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}, payments:{orderBy:{paidDate:'desc'}}}});
      if(!b) throw new NotFoundException({code:'NOT_FOUND', message:'Bill not found.'});
      return b;
    });
  }

  @Post('vendor-bills')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_WRITE)
  async saveBill(@CurrentUser() u:AuthUser, @Body() dto:SaveVendorBillDto){
    if(!dto.items?.length) throw new BadRequestException({code:'NO_ITEMS', message:'At least one line item is required.'});
    if(!dto.vendorName?.trim()) throw new BadRequestException({code:'VENDOR_REQUIRED', message:'Vendor is required.'});
    const calc = calculateVendorBill(dto.items.map(i=>({description:i.description, hsnCode:i.hsnCode, quantity:i.quantity, unit:i.unit, rate:i.rate, taxPercent:i.taxPercent})), {supplyType: dto.supplyType, tdsPercent: dto.tdsPercent});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const billId = (dto.vendorBillId||'')?.trim() || null;
      let existing:any=null;
      if(billId) existing = await tx.vendorBill.findFirst({where:{id:billId, deletedAt:null}});
      const isNew = !existing;
      if(billId && !existing) throw new NotFoundException({code:'NOT_FOUND', message:'Bill not found.'});
      // dup billNo check
      const dup = await tx.vendorBill.findFirst({where:{tenantId:u.tenantId, billNo: dto.billNo.trim(), deletedAt:null, ...(isNew?{}:{NOT:{id:existing.id}})}});
      if(dup) throw new ConflictException({code:'DUPLICATE_BILL_NO', message:`Bill number ${dto.billNo} already exists.`});

      const data:any={
        vendorId: dto.vendorId || existing?.vendorId || null,
        vendorName: dto.vendorName.trim(),
        billNo: dto.billNo.trim(),
        billDate: new Date(dto.billDate),
        dueDate: new Date(dto.dueDate),
        subTotal: calc.subtotal,
        cgstAmount: calc.cgstTotal,
        sgstAmount: calc.sgstTotal,
        igstAmount: calc.igstTotal,
        tdsAmount: calc.tdsAmount,
        taxPercent: calc.taxPercent,
        totalAmount: calc.total,
        supplyType: String(dto.supplyType|| existing?.supplyType || 'INTRA').toUpperCase(),
        status: (dto.status?.toUpperCase() as any) || existing?.status || 'DRAFT',
        tenderOrderId: dto.tenderOrderId || existing?.tenderOrderId || null,
        notes: dto.notes ?? existing?.notes ?? null,
        updatedById: u.id,
      };
      let savedId:string;
      if(isNew){
        const created = await tx.vendorBill.create({data:{...data, tenantId:u.tenantId, paidAmount:0, createdById:u.id}});
        savedId=created.id;
      } else {
        const updated = await tx.vendorBill.update({where:{id:existing.id}, data});
        savedId=updated.id;
        await tx.vendorBillItem.deleteMany({where:{vendorBillId:savedId}});
      }
      for(let idx=0; idx<calc.items.length; idx++){
        const it=calc.items[idx];
        await tx.vendorBillItem.create({data:{
          tenantId:u.tenantId,
          vendorBillId:savedId,
          sortOrder: idx+1,
          description: it.description,
          hsnCode: it.hsnCode || null,
          quantity: it.quantity,
          unit: it.unit || null,
          rate: it.rate,
          taxPercent: it.taxPercent,
          cgstAmount: it.cgstAmount,
          sgstAmount: it.sgstAmount,
          igstAmount: it.igstAmount,
          amount: it.amount,
        }});
      }
      return tx.vendorBill.findFirst({where:{id:savedId}, include:{items:{orderBy:{sortOrder:'asc'}}}});
    });
  }

  @Post('vendor-bills/:id/cancel')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_WRITE)
  async cancelBill(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const b = await tx.vendorBill.findFirst({where:{id, deletedAt:null}});
      if(!b) throw new NotFoundException({code:'NOT_FOUND', message:'Bill not found.'});
      if(Number(b.paidAmount)>0) throw new BadRequestException({code:'HAS_PAYMENTS', message:'Cannot cancel a bill that has payments.'});
      return tx.vendorBill.update({where:{id}, data:{status:'CANCELLED' as any, updatedById:u.id}});
    });
  }

  @Post('vendor-bills/:id/payments')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_WRITE)
  async recordVendorPayment(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() dto:VendorPaymentDto){
    const gross = Number(dto.grossAmount);
    if(!(gross>0)) throw new BadRequestException({code:'INVALID_AMOUNT', message:'Payment amount must be greater than zero.'});
    const tds = Number(dto.tdsAmount||0);
    const net = Math.round((gross - tds)*100)/100;
    if(net<0) throw new BadRequestException({code:'TDS_EXCEEDS_GROSS', message:'TDS cannot exceed gross amount.'});
    const mode = String(dto.mode||'NEFT').toUpperCase();
    if(!['NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','CARD','OTHER'].includes(mode)) throw new BadRequestException({code:'INVALID_MODE', message:'Invalid payment mode.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const bill = await tx.vendorBill.findFirst({where:{id, deletedAt:null}});
      if(!bill) throw new NotFoundException({code:'NOT_FOUND', message:'Bill not found.'});
      const needs = needsApproval(net);
      const status = needs ? 'PENDING' : 'APPROVED';
      const pay = await tx.vendorPayment.create({data:{
        tenantId:u.tenantId,
        vendorBillId:id,
        vendorId: bill.vendorId,
        vendorName: bill.vendorName,
        paidDate: dto.paidDate ? new Date(dto.paidDate) : new Date(todayIso()),
        grossAmount: gross,
        tdsAmount: tds,
        netPaidAmount: net,
        mode: mode as any,
        referenceNo: dto.referenceNo?.trim() || null,
        bankAccount: dto.bankAccount?.trim() || null,
        notes: dto.notes || null,
        approvalStatus: status as any,
        approvedById: needs ? null : u.id,
        approvedAt: needs ? null : new Date(),
        createdById: u.id,
      }});
      if(needs){
        await tx.financeApproval.create({data:{
          tenantId:u.tenantId,
          approvalType:'ACCOUNTS_VENDOR_PAYMENT' as any,
          referenceType:'VENDOR_PAYMENT',
          referenceId: pay.id,
          amount: net,
          status:'PENDING' as any,
          requestedById:u.id,
          notes:`Vendor payment to ${bill.vendorName} against bill ${bill.billNo}`,
        }});
      } else {
        const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
        if(bank){
          const {debit, credit}=journalDebitCredit('PAYMENT', net);
          await tx.journalEntry.create({data:{
            tenantId:u.tenantId,
            entryDate: pay.paidDate,
            accountId:bank.id,
            accountName:bank.name,
            entryType:'PAYMENT' as any,
            referenceType:'VENDOR_PAYMENT',
            referenceId:pay.id,
            referenceNo:`${bill.billNo} / ${pay.referenceNo||''}`,
            description:`Payment to ${bill.vendorName} against bill ${bill.billNo}`,
            debit, credit,
            createdById:u.id,
          }});
          await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance),'PAYMENT', net)}});
        }
        await this.recomputeBill(tx, id, todayIso());
      }
      return pay;
    });
  }

  @Post('vendor-payments/:id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async approveVendorPayment(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const p = await tx.vendorPayment.findFirst({where:{id}});
      if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Payment not found.'});
      if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Payment is not pending approval.'});
      await tx.vendorPayment.update({where:{id}, data:{approvalStatus:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
      const bill = await tx.vendorBill.findFirst({where:{id:p.vendorBillId}});
      const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
      if(bank && bill){
        const {debit,credit}=journalDebitCredit('PAYMENT', Number(p.netPaidAmount));
        await tx.journalEntry.create({data:{
          tenantId:u.tenantId,
          entryDate:p.paidDate,
          accountId:bank.id,
          accountName:bank.name,
          entryType:'PAYMENT' as any,
          referenceType:'VENDOR_PAYMENT',
          referenceId:p.id,
          referenceNo:`${bill.billNo} / ${p.referenceNo||''}`,
          description:`Payment to ${p.vendorName} against bill ${bill.billNo}`,
          debit, credit,
          createdById:u.id,
        }});
        await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance),'PAYMENT', Number(p.netPaidAmount))}});
      }
      if(bill) await this.recomputeBill(tx, bill.id, todayIso());
      const appr = await tx.financeApproval.findFirst({where:{referenceId:p.id, approvalType:'ACCOUNTS_VENDOR_PAYMENT' as any, active:true}});
      if(appr) await tx.financeApproval.update({where:{id:appr.id}, data:{status:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
      return {ok:true};
    });
  }

  @Post('vendor-payments/:id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async rejectVendorPayment(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const p = await tx.vendorPayment.findFirst({where:{id}});
      if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Payment not found.'});
      if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Payment is not pending approval.'});
      await tx.vendorPayment.update({where:{id}, data:{approvalStatus:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
      await this.recomputeBill(tx, p.vendorBillId, todayIso());
      const appr = await tx.financeApproval.findFirst({where:{referenceId:p.id, approvalType:'ACCOUNTS_VENDOR_PAYMENT' as any, active:true}});
      if(appr) await tx.financeApproval.update({where:{id:appr.id}, data:{status:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
      return {ok:true};
    });
  }

  // ---------- Bank ----------
  @Get('bank-accounts')
  @RequirePermission(PERMISSIONS.BANK_READ)
  async listBankAccounts(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, tx=> tx.bankAccount.findMany({where:{active:true}, orderBy:{name:'asc'}}));
  }

  @Post('bank-accounts')
  @RequirePermission(PERMISSIONS.BANK_WRITE)
  async saveBankAccount(@CurrentUser() u:AuthUser, @Body() dto:BankAccountDto){
    if(!dto.name?.trim()) throw new BadRequestException({code:'NAME_REQUIRED', message:'Account name is required.'});
    const type = String(dto.type||'BANK').toUpperCase();
    if(!['BANK','CASH','CREDIT_CARD','PETTY_CASH'].includes(type)) throw new BadRequestException({code:'INVALID_TYPE', message:'Invalid account type.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const existing = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, name: dto.name.trim(), active:true}});
      // if exists and not updating same id, conflict; but we use upsert by name for simplicity: create new always; for updates use id param? Keep simple: create new
      // Check if payload includes id via dto as any
      const id = (dto as any).id as string|undefined;
      let account:any=null;
      if(id) account = await tx.bankAccount.findFirst({where:{id, tenantId:u.tenantId}});
      if(account){
        const updated = await tx.bankAccount.update({where:{id:account.id}, data:{
          name: dto.name.trim(),
          type: type as any,
          bankName: dto.bankName?.trim() || null,
          accountNo: dto.accountNo?.trim() || null,
          ifsc: dto.ifsc?.trim().toUpperCase() || null,
          branch: dto.branch?.trim() || null,
          openingBalance: dto.openingBalance ?? account.openingBalance,
          notes: dto.notes ?? null,
          isDefault: !!dto.isDefault,
          updatedById: u.id,
        }});
        if(dto.isDefault){
          await tx.bankAccount.updateMany({where:{tenantId:u.tenantId, id:{not:updated.id}, isDefault:true}, data:{isDefault:false}});
        }
        await this.recomputeBankBalance(tx, updated.id);
        return updated;
      } else {
        if(existing) throw new ConflictException({code:'DUPLICATE_ACCOUNT', message:'An account with this name already exists.'});
        // unset other defaults if this is default
        if(dto.isDefault) await tx.bankAccount.updateMany({where:{tenantId:u.tenantId, isDefault:true}, data:{isDefault:false}});
        const created = await tx.bankAccount.create({data:{
          tenantId:u.tenantId,
          name: dto.name.trim(),
          type: type as any,
          bankName: dto.bankName?.trim() || null,
          accountNo: dto.accountNo?.trim() || null,
          ifsc: dto.ifsc?.trim().toUpperCase() || null,
          branch: dto.branch?.trim() || null,
          openingBalance: dto.openingBalance ?? 0,
          currentBalance: dto.openingBalance ?? 0,
          isDefault: !!dto.isDefault,
          notes: dto.notes || null,
          createdById:u.id,
          updatedById:u.id,
        }});
        await this.recomputeBankBalance(tx, created.id);
        return created;
      }
    });
  }

  @Get('bank-book')
  @RequirePermission(PERMISSIONS.BANK_READ)
  async getBankBook(@CurrentUser() u:AuthUser, @Query('accountId') accountId?:string, @Query('fromDate') fromDate?:string, @Query('toDate') toDateStr?:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const accounts = await tx.bankAccount.findMany({where:{active:true, ...(accountId?{id:accountId}:{})}});
      let journalWhere:any={ active:true };
      if(accountId) journalWhere.accountId=accountId;
      if(fromDate) journalWhere.entryDate={ gte: new Date(fromDate)};
      if(toDateStr) journalWhere.entryDate={ ...(journalWhere.entryDate||{}), lte: new Date(toDateStr)};
      const journal = await tx.journalEntry.findMany({where:journalWhere, orderBy:[{entryDate:'asc'},{createdAt:'asc'}]});
      return {accounts, journal};
    });
  }

  @Get('finance/overview')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async getOverview(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const today=todayIso();
      const yyyymm = today.slice(0,7);
      const invoices = await tx.invoice.findMany({where:{deletedAt:null, status:{not:'CANCELLED'}}});
      let outstanding=0, overdue=0, draftInvoices=0;
      for(const i of invoices){
        const bal = Number(i.totalAmount) - Number(i.paidAmount);
        if(bal>0.01) outstanding+=bal;
        if(bal>0.01 && i.dueDate && i.dueDate.toISOString().slice(0,10) < today) overdue+=bal;
        if(String(i.status)==='DRAFT') draftInvoices++;
      }
      const receipts = await tx.invoicePayment.findMany({where:{approvalStatus:'APPROVED'}});
      let thisMonthReceipts=0;
      for(const p of receipts){ if(String(p.receivedDate).slice(0,7)===yyyymm) thisMonthReceipts+=Number(p.amount||0); }
      const vPayments = await tx.vendorPayment.findMany({where:{approvalStatus:'APPROVED'}});
      let thisMonthPayments=0;
      for(const p of vPayments){ if(String(p.paidDate).slice(0,7)===yyyymm) thisMonthPayments+=Number(p.netPaidAmount||0); }
      const pendingApprovals = await tx.financeApproval.count({where:{active:true, status:'PENDING'}});
      const bankAccounts = await tx.bankAccount.findMany({where:{active:true}});
      const cashPosition = bankAccounts.reduce((s,a)=> s+Number(a.currentBalance||0),0);
      const ageing = bucketAgeing(invoices.map(i=>({dueDate: i.dueDate? i.dueDate.toISOString().slice(0,10): null, total:Number(i.totalAmount), paid:Number(i.paidAmount)})), today);
      const recentInvoices = [...invoices].sort((a,b)=> String(b.invoiceDate).localeCompare(String(a.invoiceDate))).slice(0,5).map(i=>({id:i.id, invoiceNo:i.invoiceNo, clientName:i.clientName, invoiceDate:i.invoiceDate, totalAmount:i.totalAmount, paidAmount:i.paidAmount, status:i.status}));
      const recentReceipts = [...receipts].sort((a,b)=> String(b.receivedDate).localeCompare(String(a.receivedDate))).slice(0,5).map(p=>({id:p.id, invoiceId:p.invoiceId, receivedDate:p.receivedDate, amount:p.amount, mode:p.mode, referenceNo:p.referenceNo}));
      return {kpi:{outstanding, overdue, thisMonthReceipts, thisMonthPayments, pendingApprovals, cashPosition, draftInvoices}, ageing, recentInvoices, recentReceipts};
    });
  }

  @Get('finance/receivable-ageing')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async receivableAgeing(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const today=todayIso();
      const invoices = await tx.invoice.findMany({where:{deletedAt:null, status:{notIn:['CANCELLED','PAID']}}});
      const buckets = bucketAgeing(invoices.map(i=>({dueDate: i.dueDate? i.dueDate.toISOString().slice(0,10): null, total:Number(i.totalAmount), paid:Number(i.paidAmount)})), today);
      const detail = invoices.map(i=>{
        const bal = Number(i.totalAmount)-Number(i.paidAmount);
        const due = i.dueDate ? new Date(i.dueDate) : null;
        const days = due ? Math.floor((new Date(today).getTime() - due.getTime())/(24*60*60*1000)) : 0;
        return {id:i.id, invoiceNo:i.invoiceNo, clientName:i.clientName, dueDate:i.dueDate, totalAmount:i.totalAmount, paidAmount:i.paidAmount, balance:bal, daysOverdue: Math.max(0,days), status:i.status};
      }).sort((a,b)=> b.daysOverdue - a.daysOverdue);
      return {buckets, invoices:detail};
    });
  }

  @Get('finance/payable-ageing')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_READ)
  async payableAgeing(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const today=todayIso();
      const bills = await tx.vendorBill.findMany({where:{deletedAt:null, status:{notIn:['CANCELLED','PAID']}}});
      const buckets = bucketAgeing(bills.map(b=>({dueDate: b.dueDate? b.dueDate.toISOString().slice(0,10): null, total:Number(b.totalAmount), paid:Number(b.paidAmount)})), today);
      const detail = bills.map(b=>{
        const bal = Number(b.totalAmount)-Number(b.paidAmount);
        const due = b.dueDate ? new Date(b.dueDate) : null;
        const days = due ? Math.floor((new Date(today).getTime() - due.getTime())/(24*60*60*1000)) : 0;
        return {id:b.id, billNo:b.billNo, vendorName:b.vendorName, dueDate:b.dueDate, totalAmount:b.totalAmount, paidAmount:b.paidAmount, balance:bal, daysOverdue: Math.max(0,days), status:b.status};
      }).sort((a,b)=> b.daysOverdue - a.daysOverdue);
      return {buckets, bills:detail};
    });
  }

  @Get('finance/gstr-summary')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async gstr(@CurrentUser() u:AuthUser, @Query('month') month?:string, @Query('year') year?:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const invoices = await tx.invoice.findMany({where:{deletedAt:null, status:{not:'CANCELLED'}}});
      const bills = await tx.vendorBill.findMany({where:{deletedAt:null, status:{not:'CANCELLED'}}});
      const res = gstrSummary(
        invoices.map(i=>({invoiceDate: i.invoiceDate.toISOString().slice(0,10), subTotal:Number(i.subTotal), taxAmount:Number(i.taxAmount), status:String(i.status)})),
        bills.map(b=>({billDate: b.billDate.toISOString().slice(0,10), subTotal:Number(b.subTotal), cgst:Number(b.cgstAmount), sgst:Number(b.sgstAmount), igst:Number(b.igstAmount), status:String(b.status)})),
        {month: month? Number(month): undefined, year: year? Number(year): undefined}
      );
      return {...res, month: month||'', year: year||''};
    });
  }

  @Get('finance/tds-summary')
  @RequirePermission(PERMISSIONS.VENDOR_BILL_READ)
  async tds(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const bills = await tx.vendorBill.findMany({where:{deletedAt:null, status:{not:'CANCELLED'}}});
      const payments = await tx.vendorPayment.findMany({where:{approvalStatus:'APPROVED'}});
      const byBill = new Map<string, number>();
      for(const p of payments){
        const k = String(p.vendorBillId);
        byBill.set(k, (byBill.get(k)||0) + Number(p.tdsAmount||0));
      }
      let totalBilled=0, totalDeducted=0, totalPending=0;
      for(const b of bills){
        totalBilled += Number(b.tdsAmount||0);
        totalDeducted += byBill.get(b.id)||0;
        if(Number(b.paidAmount)< Number(b.totalAmount)) totalPending += Number(b.tdsAmount||0);
      }
      return {totalBilled: Math.round(totalBilled*100)/100, totalDeducted: Math.round(totalDeducted*100)/100, totalPending: Math.round(totalPending*100)/100};
    });
  }

  @Get('finance/profit-loss')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async pnl(@CurrentUser() u:AuthUser, @Query('fromDate') fromDate?:string, @Query('toDate') toDateStr?:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const invoices = await tx.invoice.findMany({where:{deletedAt:null, status:{notIn:['CANCELLED','DRAFT']}}});
      const bills = await tx.vendorBill.findMany({where:{deletedAt:null, status:{notIn:['CANCELLED','DRAFT']}}});
      const r = profitLoss(
        invoices.map(i=>({invoiceDate:i.invoiceDate.toISOString().slice(0,10), totalAmount:Number(i.totalAmount), status:String(i.status)})),
        bills.map(b=>({billDate:b.billDate.toISOString().slice(0,10), totalAmount:Number(b.totalAmount), status:String(b.status)})),
        fromDate||null, toDateStr||null
      );
      return {...r, fromDate: fromDate||'', toDate: toDateStr||''};
    });
  }

  @Get('finance/approvals')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async listApprovals(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, tx=> tx.financeApproval.findMany({where:{active:true, status:'PENDING'}, orderBy:{requestedAt:'desc'}}));
  }

  @Post('finance/approvals/:id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async approveFinanceApproval(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const a = await tx.financeApproval.findFirst({where:{id}});
      if(!a) throw new NotFoundException({code:'NOT_FOUND', message:'Approval not found.'});
      if(String(a.status)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Already decided.'});
      // route to the underlying payment receipt
      if(String(a.approvalType)==='ACCOUNTS_RECEIPT'){
        const p = await tx.invoicePayment.findFirst({where:{id:a.referenceId}});
        if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Linked receipt not found.'});
        if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Receipt already decided.'});
        await tx.invoicePayment.update({where:{id:p.id}, data:{approvalStatus:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
        const inv = await tx.invoice.findFirst({where:{id:p.invoiceId}});
        const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
        if(bank && inv){
          const {debit,credit}=journalDebitCredit('RECEIPT', Number(p.amount));
          await tx.journalEntry.create({data:{tenantId:u.tenantId, entryDate:p.receivedDate, accountId:bank.id, accountName:bank.name, entryType:'RECEIPT' as any, referenceType:'INVOICE_PAYMENT', referenceId:p.id, referenceNo:`${inv.invoiceNo} / ${p.referenceNo}`, description:`Receipt from ${inv.clientName} against ${inv.invoiceNo}`, debit, credit, createdById:u.id}});
          await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance),'RECEIPT', Number(p.amount))}});
        }
        if(inv) await this.recomputeInvoice(tx, inv.id, todayIso());
      } else if(String(a.approvalType)==='ACCOUNTS_VENDOR_PAYMENT'){
        const p = await tx.vendorPayment.findFirst({where:{id:a.referenceId}});
        if(!p) throw new NotFoundException({code:'NOT_FOUND', message:'Linked payment not found.'});
        if(String(p.approvalStatus)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Already decided.'});
        await tx.vendorPayment.update({where:{id:p.id}, data:{approvalStatus:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
        const bill = await tx.vendorBill.findFirst({where:{id:p.vendorBillId}});
        const bank = await tx.bankAccount.findFirst({where:{tenantId:u.tenantId, active:true}, orderBy:[{isDefault:'desc'},{name:'asc'}]});
        if(bank && bill){
          const amt = Number((p as any).netAmount ?? (p as any).netPaidAmount ?? p.grossAmount);
          const {debit,credit}=journalDebitCredit('PAYMENT' as any, amt);
          await tx.journalEntry.create({data:{tenantId:u.tenantId, entryDate: (p as any).paidDate ?? new Date(), accountId:bank.id, accountName:bank.name, entryType:'PAYMENT' as any, referenceType:'VENDOR_PAYMENT', referenceId:p.id, referenceNo:`${bill.billNo} / ${(p as any).referenceNo??''}`, description:`Payment to ${bill.vendorName} against ${bill.billNo}`, debit, credit, createdById:u.id}});
          await tx.bankAccount.update({where:{id:bank.id}, data:{currentBalance: bankBalanceAfter(Number(bank.currentBalance),'PAYMENT' as any, amt) as any}});
        }
        if(bill) await this.recomputeBill(tx, bill.id, todayIso());
      }
      await tx.financeApproval.update({where:{id:a.id}, data:{status:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
      return {ok:true};
    });
  }

  @Post('finance/approvals/:id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async rejectFinanceApproval(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const a = await tx.financeApproval.findFirst({where:{id}});
      if(!a) throw new NotFoundException({code:'NOT_FOUND', message:'Approval not found.'});
      if(String(a.status)!=='PENDING') throw new BadRequestException({code:'NOT_PENDING', message:'Already decided.'});
      if(String(a.approvalType)==='ACCOUNTS_RECEIPT'){
        const p = await tx.invoicePayment.findFirst({where:{id:a.referenceId}});
        if(p) await tx.invoicePayment.update({where:{id:p.id}, data:{approvalStatus:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
        if(p) await this.recomputeInvoice(tx, p.invoiceId, todayIso());
      } else if(String(a.approvalType)==='ACCOUNTS_VENDOR_PAYMENT'){
        const p = await tx.vendorPayment.findFirst({where:{id:a.referenceId}});
        if(p) await tx.vendorPayment.update({where:{id:p.id}, data:{approvalStatus:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
        const bill = p ? await tx.vendorBill.findFirst({where:{id:p.vendorBillId}}) : null;
        if(bill) await this.recomputeBill(tx, bill.id, todayIso());
      }
      await tx.financeApproval.update({where:{id:a.id}, data:{status:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason:String(body?.reason||'')}});
      return {ok:true};
    });
  }

  @Get('invoices/:id/html')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async invoiceHtml(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Res({passthrough:true}) res:Response){
    const data = await this.prisma.withTenant(u.tenantId, async tx=>{
      const inv = await tx.invoice.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      if(!inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      const company = await tx.company.findFirst({where:{deletedAt:null}, orderBy:{code:'asc'}});
      return {inv, company};
    });
    const html = buildInvoiceHtml(
      {invoiceNo:data.inv.invoiceNo, invoiceDate:data.inv.invoiceDate.toISOString().slice(0,10), dueDate:data.inv.dueDate.toISOString().slice(0,10), clientName:data.inv.clientName, periodFrom: data.inv.periodFrom?.toISOString().slice(0,10)||null, periodTo: data.inv.periodTo?.toISOString().slice(0,10)||null, subTotal:Number(data.inv.subTotal), taxPercent:Number(data.inv.taxPercent), taxAmount:Number(data.inv.taxAmount), totalAmount:Number(data.inv.totalAmount), notes:data.inv.notes},
      data.inv.items.map(it=>({sortOrder:it.sortOrder, description:it.description, hsnCode:it.hsnCode, quantity:Number(it.quantity), unit:it.unit, rate:Number(it.rate), amount:Number(it.amount)})),
      {name: data.company?.displayName || 'Company', address: data.company?.legalName || '', phone:'', email:''}
    );
    res.setHeader('content-type','text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('invoices/:id/pdf')
  @RequirePermission(PERMISSIONS.INVOICE_READ)
  async invoicePdf(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Res() res:Response){
    const data = await this.prisma.withTenant(u.tenantId, async tx=>{
      const inv = await tx.invoice.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      if(!inv) throw new NotFoundException({code:'NOT_FOUND', message:'Invoice not found.'});
      const company = await tx.company.findFirst({where:{deletedAt:null}, orderBy:{code:'asc'}});
      return {inv, company};
    });
    const html = buildInvoiceHtml(
      {invoiceNo:data.inv.invoiceNo, invoiceDate:data.inv.invoiceDate.toISOString().slice(0,10), dueDate:data.inv.dueDate.toISOString().slice(0,10), clientName:data.inv.clientName, periodFrom: data.inv.periodFrom?.toISOString().slice(0,10)||null, periodTo: data.inv.periodTo?.toISOString().slice(0,10)||null, subTotal:Number(data.inv.subTotal), taxPercent:Number(data.inv.taxPercent), taxAmount:Number(data.inv.taxAmount), totalAmount:Number(data.inv.totalAmount), notes:data.inv.notes},
      data.inv.items.map(it=>({sortOrder:it.sortOrder, description:it.description, hsnCode:it.hsnCode, quantity:Number(it.quantity), unit:it.unit, rate:Number(it.rate), amount:Number(it.amount)})),
      {name: data.company?.displayName || 'Company', address: data.company?.legalName || '', phone:'', email:''}
    );
    // Return HTML for print-to-PDF on client (Rule 4: no local file storage; avoid server-side puppeteer which writes to disk)
    res.setHeader('content-type','text/html; charset=utf-8');
    res.setHeader('content-disposition', `inline; filename="${data.inv.invoiceNo}.html"`);
    return res.send(html);
  }

  // internal recompute helpers
  private async recomputeInvoice(tx:any, invoiceId:string, today:string){
    const inv = await tx.invoice.findFirst({where:{id:invoiceId}});
    if(!inv) return;
    const pays = await tx.invoicePayment.findMany({where:{invoiceId, approvalStatus:'APPROVED'}});
    const totalPaid = pays.reduce((s:number,p:any)=> s+ Number(p.amount||0),0);
    const status = recomputeInvoiceStatus(Number(inv.totalAmount), totalPaid, inv.dueDate? inv.dueDate.toISOString().slice(0,10): null, today);
    await tx.invoice.update({where:{id:invoiceId}, data:{paidAmount: totalPaid, status: status as any}});
  }
  private async recomputeBill(tx:any, billId:string, today:string){
    const bill = await tx.vendorBill.findFirst({where:{id:billId}});
    if(!bill) return;
    const pays = await tx.vendorPayment.findMany({where:{vendorBillId:billId, approvalStatus:'APPROVED'}});
    const totalNet = pays.reduce((s:number,p:any)=> s+ Number(p.netPaidAmount||0),0);
    const status = recomputeBillStatus(Number(bill.totalAmount), totalNet, bill.dueDate? bill.dueDate.toISOString().slice(0,10): null, today);
    await tx.vendorBill.update({where:{id:billId}, data:{paidAmount: totalNet, status: status as any}});
  }
  private async recomputeBankBalance(tx:any, accountId:string){
    const acc = await tx.bankAccount.findFirst({where:{id:accountId}});
    if(!acc) return;
    const jnl = await tx.journalEntry.findMany({where:{accountId, active:true}});
    let bal = Number(acc.openingBalance||0);
    for(const j of jnl){ bal += Number(j.debit||0) - Number(j.credit||0); }
    await tx.bankAccount.update({where:{id:accountId}, data:{currentBalance: bal}});
  }
}
