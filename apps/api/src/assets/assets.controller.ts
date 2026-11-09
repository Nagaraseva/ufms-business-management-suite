import {
  BadRequestException, Body, ConflictException, Controller, Get, NotFoundException,
  Param, ParseUUIDPipe, Post, Query, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested, MaxLength, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { buildPurchaseOrderHtml } from '@ufms/shared/finance/finance-rules';
import { canTransitionPO, calculatePurchaseOrder } from '@ufms/shared/finance/finance-rules';
import { encryptField } from '../common/field-crypto';

class VendorDto {
  @IsString() @MaxLength(120) vendorName: string;
  @IsOptional() @IsString() @MaxLength(40) vendorCode?: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @IsOptional() @IsString() @MaxLength(20) panNo?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNo?: string;
  @IsOptional() @IsString() @MaxLength(20) ifsc?: string;
  @IsOptional() @IsString() @MaxLength(500) categories?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class AssetDto {
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() @MaxLength(40) assetCode?: string;
  @IsString() @MaxLength(200) assetName: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(80) serialNo?: string;
  @IsOptional() @IsString() purchaseDate?: string;
  @IsOptional() @IsNumber() purchaseValue?: number;
  @IsOptional() @IsString() @MaxLength(200) vendor?: string;
  @IsOptional() @IsString() warrantyExpiry?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class AssignAssetDto {
  @IsString() assignedToType: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsString() @MaxLength(200) assignedToName: string;
  @IsString() assignedFromDate: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class StockItemDto {
  @IsOptional() @IsString() stockItemId?: string;
  @IsOptional() @IsString() @MaxLength(40) itemCode?: string;
  @IsString() @MaxLength(200) itemName: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber() @Min(0) minStockLevel?: number;
  @IsOptional() @IsNumber() @Min(0) reorderQty?: number;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class StockPurchaseItemDto {
  @IsString() stockItemId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsNumber() @Min(0) unitCost: number;
}

class SaveStockPurchaseDto {
  @IsOptional() @IsString() @MaxLength(80) purchaseNumber?: string;
  @IsString() purchaseDate: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() @MaxLength(80) invoiceNo?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ValidateNested({each:true}) @Type(()=>StockPurchaseItemDto) items: StockPurchaseItemDto[];
}

class StockDistributionItemDto {
  @IsString() stockItemId: string;
  @IsNumber() @Min(0.01) quantity: number;
}

class SaveStockDistributionDto {
  @IsOptional() @IsString() @MaxLength(80) challanNumber?: string;
  @IsString() distributionDate: string;
  @IsString() issuedToType: string;
  @IsOptional() @IsString() issuedToId?: string;
  @IsString() @MaxLength(200) issuedToName: string;
  @IsOptional() @IsString() siteType?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MaxLength(200) siteName?: string;
  @IsOptional() @IsString() @MaxLength(1000) purpose?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ValidateNested({each:true}) @Type(()=>StockDistributionItemDto) items: StockDistributionItemDto[];
}

class PoItemDto {
  @IsString() stockItemId: string;
  @IsOptional() @IsString() itemName?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) unitCost: number;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
}

class SavePoDto {
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() @MaxLength(40) poNumber?: string;
  @IsString() poDate: string;
  @IsString() vendorId: string;
  @IsOptional() @IsString() @MaxLength(200) vendorName?: string;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() indentId?: string;
  @IsOptional() @IsString() purchaseRequestId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ValidateNested({each:true}) @Type(()=>PoItemDto) items: PoItemDto[];
}

class IndentDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(1000) purpose?: string;
  @IsOptional() @IsString() neededByDate?: string;
  @IsOptional() @IsNumber() @Min(1) totalItems?: number;
}

async function nextCode(tx:any, table:string, col:string, tenantId:string, prefix:string):Promise<string>{
  const rows:any[] = await tx.$queryRawUnsafe(`SELECT "${col}" FROM "${table}" WHERE "tenantId"=$1::uuid AND "${col}" LIKE $2 ORDER BY "${col}" DESC LIMIT 1`, tenantId, `${prefix}%`);
  const last = rows[0]?.[col] as string|undefined;
  let n=1;
  if(last){ const m=last.match(/(\d+)$/); if(m) n=parseInt(m[1],10)+1; }
  const candidate = `${prefix}-${String(n).padStart(4,'0')}`;
  const exists:any[] = await tx.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE "tenantId"=$1::uuid AND "${col}"=$2 LIMIT 1`, tenantId, candidate);
  if(exists.length) return `${prefix}-${Date.now().toString().slice(-6)}`;
  return candidate;
}

@ApiTags('assets')
@Controller('api/v1')
export class AssetsController {
  constructor(private readonly prisma: PrismaService){}

  // ----- Vendors -----
  @Get('vendors')
  @RequirePermission(PERMISSIONS.VENDOR_READ)
  async listVendors(@CurrentUser() u:AuthUser, @Query('q') q?:string, @Query('status') status?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={deletedAt:null};
      if(status) where.status=status.toUpperCase();
      if(q){ where.OR=[{vendorName:{contains:q, mode:'insensitive'}},{vendorCode:{contains:q, mode:'insensitive'}},{contactPerson:{contains:q, mode:'insensitive'}}];}
      const [items,total]=await Promise.all([tx.vendor.findMany({where, orderBy:{vendorName:'asc'}, skip, take}), tx.vendor.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Get('vendors/options')
  @RequirePermission(PERMISSIONS.VENDOR_READ)
  async vendorOptions(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, tx=> tx.vendor.findMany({where:{deletedAt:null, status:'ACTIVE'}, select:{id:true, vendorCode:true, vendorName:true}, orderBy:{vendorName:'asc'}, take:500}));
  }

  @Get('vendors/:id')
  @RequirePermission(PERMISSIONS.VENDOR_READ)
  async getVendor(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const v=await tx.vendor.findFirst({where:{id, deletedAt:null}});
      if(!v) throw new NotFoundException({code:'NOT_FOUND', message:'Vendor not found.'});
      return v;
    });
  }

  @Post('vendors')
  @RequirePermission(PERMISSIONS.VENDOR_WRITE)
  async saveVendor(@CurrentUser() u:AuthUser, @Body() dto:VendorDto){
    if(!dto.vendorName?.trim()) throw new BadRequestException({code:'NAME_REQUIRED', message:'Vendor name is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const id = (dto as any).id as string|undefined;
      const vendorCode = dto.vendorCode?.trim().toUpperCase() || await nextCode(tx,'vendors','vendorCode',u.tenantId,'VEN');
      if(id){
        const ex=await tx.vendor.findFirst({where:{id, deletedAt:null}});
        if(!ex) throw new NotFoundException({code:'NOT_FOUND', message:'Vendor not found.'});
        const dup=await tx.vendor.findFirst({where:{tenantId:u.tenantId, vendorCode, deletedAt:null, NOT:{id}}});
        if(dup) throw new ConflictException({code:'DUPLICATE_CODE', message:`Vendor code ${vendorCode} already exists.`});
        return tx.vendor.update({where:{id}, data:{
          vendorCode, vendorName: dto.vendorName.trim(), contactPerson: dto.contactPerson||null, mobile: dto.mobile||null, email: dto.email||null,
          address: dto.address||null, gstin: dto.gstin?.toUpperCase()||null, panNo: dto.panNo?.toUpperCase()||null, bankName: dto.bankName||null,
          bankAccountNo: dto.bankAccountNo||null, bankAccountEnc: dto.bankAccountNo? encryptField(dto.bankAccountNo): null,
          ifsc: dto.ifsc?.toUpperCase()||null, categories: dto.categories||null, status: (dto.status?.toUpperCase() as any)|| ex.status, notes: dto.notes||null, updatedById:u.id
        }});
      } else {
        const dup=await tx.vendor.findFirst({where:{tenantId:u.tenantId, vendorCode, deletedAt:null}});
        if(dup) throw new ConflictException({code:'DUPLICATE_CODE', message:`Vendor code ${vendorCode} already exists.`});
        return tx.vendor.create({data:{
          tenantId:u.tenantId, vendorCode, vendorName: dto.vendorName.trim(), contactPerson: dto.contactPerson||null, mobile: dto.mobile||null, email: dto.email||null,
          address: dto.address||null, gstin: dto.gstin?.toUpperCase()||null, panNo: dto.panNo?.toUpperCase()||null, bankName: dto.bankName||null,
          bankAccountNo: dto.bankAccountNo||null, bankAccountEnc: dto.bankAccountNo? encryptField(dto.bankAccountNo): null,
          ifsc: dto.ifsc?.toUpperCase()||null, categories: dto.categories||null, status: (dto.status?.toUpperCase() as any)|| 'ACTIVE', notes: dto.notes||null, createdById:u.id, updatedById:u.id
        }});
      }
    });
  }

  @Post('vendors/:id/delete')
  @RequirePermission(PERMISSIONS.VENDOR_WRITE)
  async deleteVendor(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const v=await tx.vendor.findFirst({where:{id, deletedAt:null}});
      if(!v) throw new NotFoundException({code:'NOT_FOUND', message:'Vendor not found.'});
      return tx.vendor.update({where:{id}, data:{deletedAt:new Date(), updatedById:u.id}});
    });
  }

  // ----- Assets -----
  @Get('assets')
  @RequirePermission(PERMISSIONS.ASSET_READ)
  async listAssets(@CurrentUser() u:AuthUser, @Query('q') q?:string, @Query('status') status?:string, @Query('category') category?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={deletedAt:null};
      if(status) where.status=status.toUpperCase();
      if(category) where.category=category.toUpperCase();
      if(q){ where.OR=[{assetCode:{contains:q, mode:'insensitive'}},{assetName:{contains:q, mode:'insensitive'}},{brand:{contains:q, mode:'insensitive'}},{serialNo:{contains:q, mode:'insensitive'}}];}
      const [items,total]=await Promise.all([tx.asset.findMany({where, orderBy:{updatedAt:'desc'}, skip, take}), tx.asset.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Get('assets/summary')
  @RequirePermission(PERMISSIONS.ASSET_READ)
  async assetSummary(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const rows = await tx.asset.findMany({where:{deletedAt:null}});
      const counts:any={AVAILABLE:0,ASSIGNED:0,RETURNED:0,RETIRED:0,LOST:0};
      const byCategory:any={}; let totalValue=0;
      for(const r of rows){ const s=String(r.status).toUpperCase(); if(counts[s]!==undefined) counts[s]++; const c=String(r.category||'Other'); byCategory[c]=(byCategory[c]||0)+1; totalValue+=Number(r.purchaseValue||0);}
      return {total:rows.length, counts, byCategory, totalValue};
    });
  }

  @Get('assets/:id')
  @RequirePermission(PERMISSIONS.ASSET_READ)
  async getAsset(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const a=await tx.asset.findFirst({where:{id, deletedAt:null}, include:{history:{where:{active:true}, orderBy:{assignedFrom:'desc'}} as any}});
      if(!a) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});
      return a;
    });
  }

  @Post('assets')
  @RequirePermission(PERMISSIONS.ASSET_WRITE)
  async saveAsset(@CurrentUser() u:AuthUser, @Body() dto:AssetDto){
    if(!dto.assetName?.trim()) throw new BadRequestException({code:'NAME_REQUIRED', message:'Asset name is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const assetId = (dto.assetId||'').trim() || null;
      let existing:any=null;
      if(assetId) { existing=await tx.asset.findFirst({where:{id:assetId, deletedAt:null}}); if(!existing) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});}
      const isNew=!existing;
      const code = dto.assetCode?.trim().toUpperCase() || (isNew ? await nextCode(tx,'assets','assetCode',u.tenantId,'AST') : existing.assetCode);
      if(code){
        const dup=await tx.asset.findFirst({where:{tenantId:u.tenantId, assetCode:code, deletedAt:null, ...(isNew?{}:{NOT:{id:existing.id}})}});
        if(dup) throw new ConflictException({code:'DUPLICATE_CODE', message:`Asset code ${code} already exists.`});
      }
      const status = String(dto.status|| (isNew?'AVAILABLE':existing.status)).toUpperCase();
      if(!['AVAILABLE','ASSIGNED','RETURNED','RETIRED','LOST'].includes(status)) throw new BadRequestException({code:'INVALID_STATUS', message:'Invalid asset status.'});
      const data:any={
        assetCode: code,
        assetName: dto.assetName.trim(),
        category: String(dto.category|| existing?.category || 'OTHER').toUpperCase(),
        brand: dto.brand||null, model: dto.model||null, serialNo: dto.serialNo||null,
        purchaseDate: dto.purchaseDate? new Date(dto.purchaseDate): (existing?.purchaseDate||null),
        purchaseValue: dto.purchaseValue ?? existing?.purchaseValue ?? 0,
        vendor: dto.vendor||null, warrantyExpiry: dto.warrantyExpiry? new Date(dto.warrantyExpiry): (existing?.warrantyExpiry||null),
        status: status as any, location: dto.location||null, notes: dto.notes||null, updatedById:u.id
      };
      let savedId:string;
      if(isNew){
        const created=await tx.asset.create({data:{...data, tenantId:u.tenantId, createdById:u.id}});
        savedId=created.id;
      } else {
        const updated=await tx.asset.update({where:{id:existing.id}, data});
        savedId=updated.id;
      }
      return tx.asset.findFirst({where:{id:savedId}});
    });
  }

  @Post('assets/:id/assign')
  @RequirePermission(PERMISSIONS.ASSET_WRITE)
  async assignAsset(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() dto:AssignAssetDto){
    if(!dto.assignedToName?.trim()) throw new BadRequestException({code:'REQUIRED', message:'assignedToName is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const asset=await tx.asset.findFirst({where:{id, deletedAt:null}});
      if(!asset) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});
      const fromDate = new Date(dto.assignedFromDate);
      // close open history
      await tx.assetHistory.updateMany({where:{assetId:id, returnedOn:null, active:true}, data:{returnedOn: fromDate}});
      await tx.assetHistory.create({data:{
        tenantId:u.tenantId, assetId:id, assignedToType: String(dto.assignedToType||'OTHER').toUpperCase(), assignedToId: dto.assignedToId||null,
        assignedToName: dto.assignedToName.trim(), assignedFrom: fromDate, notes: dto.notes||null, createdById:u.id
      }});
      return tx.asset.update({where:{id}, data:{
        status:'ASSIGNED' as any, assignedToType: String(dto.assignedToType).toUpperCase(), assignedToId: dto.assignedToId||null, assignedFromDate: fromDate,
        assignedToName: dto.assignedToName.trim(), location: dto.location|| asset.location, updatedById:u.id
      }});
    });
  }

  @Post('assets/:id/return')
  @RequirePermission(PERMISSIONS.ASSET_WRITE)
  async returnAsset(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() dto:{returnedOn?:string; notes?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const asset=await tx.asset.findFirst({where:{id, deletedAt:null}});
      if(!asset) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});
      const returnedOn = dto?.returnedOn ? new Date(dto.returnedOn) : new Date();
      await tx.assetHistory.updateMany({where:{assetId:id, returnedOn:null, active:true}, data:{returnedOn}});
      return tx.asset.update({where:{id}, data:{status:'RETURNED' as any, assignedToType:null, assignedToId:null, assignedFromDate:null, assignedToName:null, updatedById:u.id}});
    });
  }

  @Post('assets/:id/retire')
  @RequirePermission(PERMISSIONS.ASSET_WRITE)
  async retireAsset(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() dto:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const asset=await tx.asset.findFirst({where:{id, deletedAt:null}});
      if(!asset) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});
      return tx.asset.update({where:{id}, data:{status:'RETIRED' as any, notes: (asset.notes||'') + ' | Retired ' + (dto?.reason||''), updatedById:u.id}});
    });
  }

  @Post('assets/:id/delete')
  @RequirePermission(PERMISSIONS.ASSET_WRITE)
  async deleteAsset(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const a=await tx.asset.findFirst({where:{id, deletedAt:null}});
      if(!a) throw new NotFoundException({code:'NOT_FOUND', message:'Asset not found.'});
      await tx.assetHistory.updateMany({where:{assetId:id, active:true}, data:{active:false}});
      return tx.asset.update({where:{id}, data:{deletedAt:new Date(), updatedById:u.id}});
    });
  }

  // ----- Stock -----
  @Get('stock-items')
  @RequirePermission(PERMISSIONS.STOCK_READ)
  async listStockItems(@CurrentUser() u:AuthUser, @Query('q') q?:string, @Query('category') category?:string, @Query('lowStockOnly') low?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={deletedAt:null, active:true};
      if(category) where.category=category.toUpperCase();
      if(q) where.OR=[{itemCode:{contains:q, mode:'insensitive'}},{itemName:{contains:q, mode:'insensitive'}},{category:{contains:q, mode:'insensitive'}}];
      let items = await tx.stockItem.findMany({where, orderBy:{updatedAt:'desc'}, skip, take});
      let total = await tx.stockItem.count({where});
      if(low==='true'){
        items = items.filter(i=> Number(i.currentBalance) < Number(i.minStockLevel) && Number(i.minStockLevel)>0);
        // need total low count; for simplicity recompute
        const all = await tx.stockItem.findMany({where});
        const lowCount = all.filter(i=> Number(i.currentBalance) < Number(i.minStockLevel) && Number(i.minStockLevel)>0).length;
        total = lowCount;
        // re-filter already done, but paginate after filter? Keep as filtered page
      }
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Get('stock-items/low-stock')
  @RequirePermission(PERMISSIONS.STOCK_READ)
  async lowStock(@CurrentUser() u:AuthUser){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const rows=await tx.stockItem.findMany({where:{deletedAt:null, active:true}});
      const alerts = rows.filter(r=> Number(r.currentBalance) < Number(r.minStockLevel) && Number(r.minStockLevel)>0)
        .map(r=>({id:r.id, itemCode:r.itemCode, itemName:r.itemName, category:r.category, unit:r.unit, currentBalance: Number(r.currentBalance), minStockLevel:Number(r.minStockLevel), reorderQty:Number(r.reorderQty), vendorName:r.vendorName}))
        .sort((a,b)=> (b.minStockLevel - b.currentBalance) - (a.minStockLevel - a.currentBalance));
      return {alerts, total: alerts.length};
    });
  }

  @Get('stock-items/:id')
  @RequirePermission(PERMISSIONS.STOCK_READ)
  async getStockItem(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const it=await tx.stockItem.findFirst({where:{id, deletedAt:null}});
      if(!it) throw new NotFoundException({code:'NOT_FOUND', message:'Stock item not found.'});
      return it;
    });
  }

  @Post('stock-items')
  @RequirePermission(PERMISSIONS.STOCK_WRITE)
  async saveStockItem(@CurrentUser() u:AuthUser, @Body() dto:StockItemDto){
    if(!dto.itemName?.trim()) throw new BadRequestException({code:'NAME_REQUIRED', message:'Item name is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const id=(dto as any).id as string|undefined;
      let existing:any=null;
      if(id) { existing=await tx.stockItem.findFirst({where:{id, deletedAt:null}}); if(!existing) throw new NotFoundException({code:'NOT_FOUND', message:'Stock item not found.'});}
      const isNew=!existing;
      const itemCode = dto.itemCode?.trim().toUpperCase() || (isNew? await nextCode(tx,'stock_items','itemCode',u.tenantId,'ITM'): existing.itemCode);
      const dup=await tx.stockItem.findFirst({where:{tenantId:u.tenantId, itemCode, deletedAt:null, ...(isNew?{}:{NOT:{id:existing.id}})}});
      if(dup) throw new ConflictException({code:'DUPLICATE_CODE', message:`Item code ${itemCode} already exists.`});
      const data:any={
        itemCode, itemName: dto.itemName.trim(), category: String(dto.category|| existing?.category || 'OTHER').toUpperCase(),
        unit: dto.unit|| existing?.unit || 'Nos', minStockLevel: dto.minStockLevel ?? existing?.minStockLevel ?? 0,
        reorderQty: dto.reorderQty ?? existing?.reorderQty ?? 0, unitCost: dto.unitCost ?? existing?.unitCost ?? 0,
        vendorId: dto.vendorId || existing?.vendorId || null, notes: dto.notes ?? existing?.notes ?? null, updatedById:u.id
      };
      if(isNew){
        return tx.stockItem.create({data:{...data, tenantId:u.tenantId, currentBalance:0, createdById:u.id}});
      } else {
        if(dto.vendorId){
          const v=await tx.vendor.findFirst({where:{id:dto.vendorId, deletedAt:null}});
          if(v) data.vendorName = v.vendorName;
        }
        return tx.stockItem.update({where:{id:existing.id}, data});
      }
    });
  }

  @Post('stock-items/:id/delete')
  @RequirePermission(PERMISSIONS.STOCK_WRITE)
  async deleteStockItem(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const it=await tx.stockItem.findFirst({where:{id, deletedAt:null}});
      if(!it) throw new NotFoundException({code:'NOT_FOUND', message:'Stock item not found.'});
      if(Number(it.currentBalance)>0) throw new BadRequestException({code:'HAS_STOCK', message:'Cannot delete an item that still has stock on hand. Issue a distribution to clear it first.'});
      return tx.stockItem.update({where:{id}, data:{deletedAt:new Date(), active:false, updatedById:u.id}});
    });
  }

  @Get('stock-purchases')
  @RequirePermission(PERMISSIONS.STOCK_READ)
  async listStockPurchases(@CurrentUser() u:AuthUser, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={active:true};
      const [items,total]=await Promise.all([tx.stockPurchase.findMany({where, orderBy:{purchaseDate:'desc'}, skip, take, include:{items:true}}), tx.stockPurchase.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Post('stock-purchases')
  @RequirePermission(PERMISSIONS.STOCK_WRITE)
  async saveStockPurchase(@CurrentUser() u:AuthUser, @Body() dto:SaveStockPurchaseDto){
    if(!dto.items?.length) throw new BadRequestException({code:'NO_ITEMS', message:'At least one item is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const purchaseNumber = dto.purchaseNumber?.trim() || await nextCode(tx,'stock_purchases','purchaseNumber',u.tenantId,'STP');
      const dup=await tx.stockPurchase.findFirst({where:{tenantId:u.tenantId, purchaseNumber}});
      if(dup) throw new ConflictException({code:'DUPLICATE_NUMBER', message:`Purchase number ${purchaseNumber} already exists.`});
      let total=0;
      for(const it of dto.items){
        const si=await tx.stockItem.findFirst({where:{id:it.stockItemId, deletedAt:null}});
        if(!si) throw new NotFoundException({code:'NOT_FOUND', message:`Stock item ${it.stockItemId} not found.`});
        total += Number(it.quantity)*Number(it.unitCost);
      }
      const vendorName = dto.vendorId ? (await tx.vendor.findFirst({where:{id:dto.vendorId}}))?.vendorName || null : null;
      const created=await tx.stockPurchase.create({data:{
        tenantId:u.tenantId, purchaseNumber, purchaseDate: new Date(dto.purchaseDate), vendorId: dto.vendorId||null, vendorName,
        invoiceNo: dto.invoiceNo||null, totalAmount: Math.round(total), notes: dto.notes||null, createdById:u.id
      }});
      for(const it of dto.items){
        const si=await tx.stockItem.findFirst({where:{id:it.stockItemId}});
        await tx.stockPurchaseItem.create({data:{
          tenantId:u.tenantId, stockPurchaseId:created.id, stockItemId:it.stockItemId, itemName: si?.itemName || '', quantity: it.quantity, unitCost: it.unitCost, amount: Math.round(Number(it.quantity)*Number(it.unitCost))
        }});
        // increase stock balance (stored)
        await tx.stockItem.update({where:{id:it.stockItemId}, data:{currentBalance: {increment: Number(it.quantity)}}});
      }
      return created;
    });
  }

  @Get('stock-distributions')
  @RequirePermission(PERMISSIONS.STOCK_READ)
  async listDistributions(@CurrentUser() u:AuthUser, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={active:true};
      const [items,total]=await Promise.all([tx.stockDistribution.findMany({where, orderBy:{distributionDate:'desc'}, skip, take, include:{items:true}}), tx.stockDistribution.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Post('stock-distributions')
  @RequirePermission(PERMISSIONS.STOCK_WRITE)
  async saveDistribution(@CurrentUser() u:AuthUser, @Body() dto:SaveStockDistributionDto){
    if(!dto.items?.length) throw new BadRequestException({code:'NO_ITEMS', message:'At least one item is required.'});
    if(!dto.issuedToName?.trim()) throw new BadRequestException({code:'REQUIRED', message:'Issued to name is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const challanNumber = dto.challanNumber?.trim() || await nextCode(tx,'stock_distributions','challanNumber',u.tenantId,'CHN');
      const dup=await tx.stockDistribution.findFirst({where:{tenantId:u.tenantId, challanNumber}});
      if(dup) throw new ConflictException({code:'DUPLICATE_CHALLAN', message:`Challan ${challanNumber} already exists.`});
      // check stock availability
      for(const it of dto.items){
        const si=await tx.stockItem.findFirst({where:{id:it.stockItemId, deletedAt:null}});
        if(!si) throw new NotFoundException({code:'NOT_FOUND', message:`Stock item ${it.stockItemId} not found.`});
        if(Number(si.currentBalance) < Number(it.quantity)) throw new BadRequestException({code:'INSUFFICIENT_STOCK', message:`Insufficient stock for ${si.itemName}: have ${si.currentBalance}, need ${it.quantity}.`});
      }
      const created=await tx.stockDistribution.create({data:{
        tenantId:u.tenantId, challanNumber, distributionDate: new Date(dto.distributionDate), issuedToType: String(dto.issuedToType).toUpperCase(),
        issuedToId: dto.issuedToId||null, issuedToName: dto.issuedToName.trim(), siteType: dto.siteType||null, siteId: dto.siteId||null, siteName: dto.siteName||null,
        issuedById:u.id, purpose: dto.purpose||null, totalItems: dto.items.length, notes: dto.notes||null, createdById:u.id
      }});
      for(const it of dto.items){
        const si=await tx.stockItem.findFirst({where:{id:it.stockItemId}});
        await tx.stockDistributionItem.create({data:{
          tenantId:u.tenantId, stockDistributionId:created.id, stockItemId:it.stockItemId, itemName: si?.itemName||'', quantity: it.quantity
        }});
        await tx.stockItem.update({where:{id:it.stockItemId}, data:{currentBalance:{decrement: Number(it.quantity)}}});
      }
      return created;
    });
  }

  @Post('stock-distributions/:id/acknowledge')
  @RequirePermission(PERMISSIONS.STOCK_WRITE)
  async acknowledgeDistribution(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const d=await tx.stockDistribution.findFirst({where:{id, active:true}});
      if(!d) throw new NotFoundException({code:'NOT_FOUND', message:'Distribution not found.'});
      if(d.acknowledgedAt) throw new BadRequestException({code:'ALREADY_ACK', message:'Already acknowledged.'});
      return tx.stockDistribution.update({where:{id}, data:{acknowledgedAt:new Date(), acknowledgedById:u.id}});
    });
  }

  // ----- Purchase Orders -----
  @Get('purchase-orders')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_READ)
  async listPOs(@CurrentUser() u:AuthUser, @Query('status') status?:string, @Query('vendorId') vendorId?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={deletedAt:null};
      if(status) where.status=status.toUpperCase();
      if(vendorId) where.vendorId=vendorId;
      const [items,total]=await Promise.all([tx.purchaseOrder.findMany({where, orderBy:{poDate:'desc'}, skip, take, include:{items:true}}), tx.purchaseOrder.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Get('purchase-orders/:id')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_READ)
  async getPO(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      return po;
    });
  }

  @Post('purchase-orders')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async savePO(@CurrentUser() u:AuthUser, @Body() dto:SavePoDto){
    if(!dto.vendorId) throw new BadRequestException({code:'VENDOR_REQUIRED', message:'Vendor is required.'});
    if(!dto.items?.length) throw new BadRequestException({code:'NO_ITEMS', message:'Add at least one line item.'});
    const calc = calculatePurchaseOrder(dto.items.map(i=>({stockItemId:i.stockItemId, itemName:i.itemName||'', quantity:i.quantity, unit:i.unit, unitCost:i.unitCost, taxPercent:i.taxPercent})));
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const vendor = await tx.vendor.findFirst({where:{id:dto.vendorId, deletedAt:null}});
      if(!vendor) throw new NotFoundException({code:'NOT_FOUND', message:'Vendor not found.'});
      const poId = (dto.purchaseOrderId||'').trim() || null;
      let existing:any=null;
      if(poId){ existing=await tx.purchaseOrder.findFirst({where:{id:poId, deletedAt:null}}); if(!existing) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
        if(['RECEIVED','CANCELLED'].includes(String(existing.status))) throw new BadRequestException({code:'CANNOT_EDIT', message:`Cannot edit a ${existing.status} purchase order.`});
      }
      const isNew=!existing;
      const poNumber = dto.poNumber?.trim() || (isNew? await nextCode(tx,'purchase_orders','poNumber',u.tenantId,'PO'): existing.poNumber);
      const dup=await tx.purchaseOrder.findFirst({where:{tenantId:u.tenantId, poNumber, deletedAt:null, ...(isNew?{}:{NOT:{id:existing.id}})}});
      if(dup) throw new ConflictException({code:'DUPLICATE_PO', message:`PO number ${poNumber} already exists.`});
      let savedId:string;
      const baseData:any={
        poNumber, poDate: new Date(dto.poDate), vendorId: vendor.id, vendorName: vendor.vendorName,
        expectedDeliveryDate: dto.expectedDeliveryDate? new Date(dto.expectedDeliveryDate): (existing?.expectedDeliveryDate||null),
        status: (dto.status?.toUpperCase() as any) || existing?.status || 'DRAFT',
        subTotal: calc.subTotal, taxAmount: calc.taxAmount, totalAmount: calc.totalAmount,
        indentId: dto.indentId|| existing?.indentId||null, purchaseRequestId: dto.purchaseRequestId|| existing?.purchaseRequestId||null,
        notes: dto.notes ?? existing?.notes ?? null, updatedById:u.id
      };
      if(isNew){
        const created=await tx.purchaseOrder.create({data:{...baseData, tenantId:u.tenantId, createdById:u.id}});
        savedId=created.id;
      } else {
        const updated=await tx.purchaseOrder.update({where:{id:existing.id}, data: baseData});
        savedId=updated.id;
        await tx.purchaseOrderItem.deleteMany({where:{purchaseOrderId:savedId}});
      }
      for(let idx=0; idx<dto.items.length; idx++){
        const it=dto.items[idx];
        const si=await tx.stockItem.findFirst({where:{id:it.stockItemId}});
        await tx.purchaseOrderItem.create({data:{
          tenantId:u.tenantId, purchaseOrderId:savedId, stockItemId: it.stockItemId, itemName: it.itemName|| si?.itemName || '',
          quantity: it.quantity, unit: it.unit||'Nos', unitCost: it.unitCost, taxPercent: it.taxPercent||0, amount: Math.round(Number(it.quantity)*Number(it.unitCost)), sortOrder: idx
        }});
      }
      return tx.purchaseOrder.findFirst({where:{id:savedId}, include:{items:{orderBy:{sortOrder:'asc'}}}});
    });
  }

  @Post('purchase-orders/:id/release')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async releasePO(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      if(String(po.status)!=='DRAFT') throw new BadRequestException({code:'INVALID_STATUS', message:'Only DRAFT purchase orders can be released.'});
      return tx.purchaseOrder.update({where:{id}, data:{status:'RELEASED' as any, approvedById:u.id, approvedAt:new Date(), updatedById:u.id}});
    });
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async cancelPO(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      if(String(po.status)==='RECEIVED') throw new BadRequestException({code:'CANNOT_CANCEL', message:'Cannot cancel a received purchase order.'});
      if(String(po.status)==='CANCELLED') return po;
      return tx.purchaseOrder.update({where:{id}, data:{status:'CANCELLED' as any, notes: (po.notes||'') + ' | Cancelled: ' + (body?.reason||''), updatedById:u.id}});
    });
  }

  @Post('purchase-orders/:id/acknowledge')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async acknowledgePO(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      if(String(po.status)!=='RELEASED') throw new BadRequestException({code:'INVALID_STATUS', message:'Only RELEASED purchase orders can be acknowledged.'});
      return tx.purchaseOrder.update({where:{id}, data:{status:'ACKNOWLEDGED' as any, updatedById:u.id}});
    });
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async receivePO(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{purchaseDate?:string; invoiceNo?:string; receivedBy?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}, include:{items:true}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      if(['RECEIVED','CANCELLED'].includes(String(po.status))) throw new BadRequestException({code:'INVALID_STATUS', message:`Purchase order is already ${po.status}.`});
      if(!po.items.length) throw new BadRequestException({code:'NO_ITEMS', message:'No line items to receive.'});
      // create stock purchase
      const purchaseNumber = await nextCode(tx,'stock_purchases','purchaseNumber',u.tenantId,'STP');
      let total=0; for(const it of po.items) total+= Number(it.quantity)*Number(it.unitCost);
      const sp=await tx.stockPurchase.create({data:{
        tenantId:u.tenantId, purchaseNumber, purchaseDate: body?.purchaseDate? new Date(body.purchaseDate): new Date(),
        vendorId: po.vendorId, vendorName: po.vendorName, purchaseOrderId: po.id, invoiceNo: body?.invoiceNo||null, totalAmount: Math.round(total), receivedBy: body?.receivedBy || null, createdById:u.id
      }});
      for(const it of po.items){
        await tx.stockPurchaseItem.create({data:{
          tenantId:u.tenantId, stockPurchaseId:sp.id, stockItemId: it.stockItemId, itemName: it.itemName, quantity: it.quantity, unitCost: it.unitCost, amount: Math.round(Number(it.quantity)*Number(it.unitCost))
        }});
        await tx.stockItem.update({where:{id:it.stockItemId}, data:{currentBalance:{increment: Number(it.quantity)}}});
      }
      return tx.purchaseOrder.update({where:{id}, data:{status:'RECEIVED' as any, updatedById:u.id}});
    });
  }

  @Get('purchase-orders/:id/html')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_READ)
  async poHtml(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Res({passthrough:true}) res:Response){
    const data=await this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      const vendor= po.vendorId ? await tx.vendor.findFirst({where:{id:po.vendorId}}) : null;
      const company= await tx.company.findFirst({where:{deletedAt:null}, orderBy:{code:'asc'}});
      return {po, vendor, company};
    });
    const html = buildPurchaseOrderHtml(
      {poNumber:data.po.poNumber, poDate: data.po.poDate.toISOString().slice(0,10), expectedDeliveryDate: data.po.expectedDeliveryDate?.toISOString().slice(0,10)||null, vendorName: data.po.vendorName, subTotal: Number(data.po.subTotal), taxAmount: Number(data.po.taxAmount), totalAmount: Number(data.po.totalAmount), notes: data.po.notes, status: String(data.po.status)} as any,
      data.po.items.map((it:any)=>({itemName:it.itemName, quantity:Number(it.quantity), unit:it.unit, unitCost:Number(it.unitCost), taxPercent:Number(it.taxPercent), amount:Number(it.amount)})),
      data.vendor? {vendorName:data.vendor.vendorName, contactPerson:data.vendor.contactPerson, mobile:data.vendor.mobile, email:data.vendor.email, gstin:data.vendor.gstin, address:data.vendor.address}: {vendorName:data.po.vendorName},
      {name: data.company?.displayName||'Company', address: data.company?.legalName||'', phone:'', email:''}
    );
    res.setHeader('content-type','text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('purchase-orders/:id/pdf')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_READ)
  async poPdf(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Res() res:Response){
    const data=await this.prisma.withTenant(u.tenantId, async tx=>{
      const po=await tx.purchaseOrder.findFirst({where:{id, deletedAt:null}, include:{items:{orderBy:{sortOrder:'asc'}}}});
      if(!po) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase order not found.'});
      const vendor= po.vendorId ? await tx.vendor.findFirst({where:{id:po.vendorId}}) : null;
      const company= await tx.company.findFirst({where:{deletedAt:null}, orderBy:{code:'asc'}});
      return {po, vendor, company};
    });
    const html = buildPurchaseOrderHtml(
      {poNumber:data.po.poNumber, poDate: data.po.poDate.toISOString().slice(0,10), expectedDeliveryDate: data.po.expectedDeliveryDate?.toISOString().slice(0,10)||null, vendorName: data.po.vendorName, subTotal: Number(data.po.subTotal), taxAmount: Number(data.po.taxAmount), totalAmount: Number(data.po.totalAmount), notes: data.po.notes, status: String(data.po.status)} as any,
      data.po.items.map((it:any)=>({itemName:it.itemName, quantity:Number(it.quantity), unit:it.unit, unitCost:Number(it.unitCost), taxPercent:Number(it.taxPercent), amount:Number(it.amount)})),
      data.vendor? {vendorName:data.vendor.vendorName, contactPerson:data.vendor.contactPerson, mobile:data.vendor.mobile, email:data.vendor.email, gstin:data.vendor.gstin, address:data.vendor.address}: {vendorName:data.po.vendorName},
      {name: data.company?.displayName||'Company', address: data.company?.legalName||'', phone:'', email:''}
    );
    res.setHeader('content-type','text/html; charset=utf-8');
    res.setHeader('content-disposition', `inline; filename="${data.po.poNumber}.html"`);
    return res.send(html);
  }

  // ----- Indents & PRs (minimal) -----
  @Get('indents')
  @RequirePermission(PERMISSIONS.INDENT_READ)
  async listIndents(@CurrentUser() u:AuthUser, @Query('status') status?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={active:true};
      if(status) where.status=status.toUpperCase();
      const [items,total]=await Promise.all([tx.indent.findMany({where, orderBy:{indentDate:'desc'}, skip, take}), tx.indent.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Post('indents')
  @RequirePermission(PERMISSIONS.INDENT_WRITE)
  async saveIndent(@CurrentUser() u:AuthUser, @Body() dto:IndentDto){
    if(!dto.title?.trim()) throw new BadRequestException({code:'TITLE_REQUIRED', message:'Title is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const indentNumber = await nextCode(tx,'indents','indentNumber',u.tenantId,'IND');
      return tx.indent.create({data:{
        tenantId:u.tenantId, indentNumber, indentDate: new Date(), neededByDate: dto.neededByDate? new Date(dto.neededByDate): null,
        title: dto.title.trim(), purpose: dto.purpose||null, totalItems: dto.totalItems||0, status:'DRAFT' as any, createdById:u.id
      }});
    });
  }

  @Post('indents/:id/submit')
  @RequirePermission(PERMISSIONS.INDENT_WRITE)
  async submitIndent(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const ind=await tx.indent.findFirst({where:{id, active:true}});
      if(!ind) throw new NotFoundException({code:'NOT_FOUND', message:'Indent not found.'});
      if(String(ind.status)!=='DRAFT') throw new BadRequestException({code:'INVALID_STATUS', message:'Only DRAFT indents can be submitted.'});
      return tx.indent.update({where:{id}, data:{status:'PENDING_APPROVAL' as any}});
    });
  }

  @Post('indents/:id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async approveIndent(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const ind=await tx.indent.findFirst({where:{id, active:true}});
      if(!ind) throw new NotFoundException({code:'NOT_FOUND', message:'Indent not found.'});
      if(String(ind.status)!=='PENDING_APPROVAL') throw new BadRequestException({code:'INVALID_STATUS', message:'Indent is not pending approval.'});
      return tx.indent.update({where:{id}, data:{status:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
    });
  }

  @Post('indents/:id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async rejectIndent(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const ind=await tx.indent.findFirst({where:{id, active:true}});
      if(!ind) throw new NotFoundException({code:'NOT_FOUND', message:'Indent not found.'});
      if(String(ind.status)!=='PENDING_APPROVAL') throw new BadRequestException({code:'INVALID_STATUS', message:'Indent is not pending approval.'});
      return tx.indent.update({where:{id}, data:{status:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason: String(body?.reason||'')}});
    });
  }

  @Get('purchase-requests')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_READ)
  async listPRs(@CurrentUser() u:AuthUser, @Query('status') status?:string, @Query('page') page='1', @Query('pageSize') pageSize='25'){
    const take=Math.min(100,Math.max(1,parseInt(pageSize,10)||25)); const skip=(Math.max(1,parseInt(page,10)||1)-1)*take;
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const where:any={active:true};
      if(status) where.status=status.toUpperCase();
      const [items,total]=await Promise.all([tx.purchaseRequest.findMany({where, orderBy:{prDate:'desc'}, skip, take}), tx.purchaseRequest.count({where})]);
      return {items,total,page:Number(page),pageSize:take};
    });
  }

  @Post('purchase-requests')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async savePR(@CurrentUser() u:AuthUser, @Body() dto:IndentDto & {indentId?:string}){
    if(!dto.title?.trim()) throw new BadRequestException({code:'TITLE_REQUIRED', message:'Title is required.'});
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const prNumber = await nextCode(tx,'purchase_requests','prNumber',u.tenantId,'PR');
      return tx.purchaseRequest.create({data:{
        tenantId:u.tenantId, prNumber, prDate: new Date(), title: dto.title.trim(), indentId: dto.indentId||null, status:'DRAFT' as any, createdById:u.id
      }});
    });
  }

  @Post('purchase-requests/:id/submit')
  @RequirePermission(PERMISSIONS.PURCHASE_ORDER_WRITE)
  async submitPR(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const pr=await tx.purchaseRequest.findFirst({where:{id, active:true}});
      if(!pr) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase request not found.'});
      if(String(pr.status)!=='DRAFT') throw new BadRequestException({code:'INVALID_STATUS', message:'Only DRAFT requests can be submitted.'});
      return tx.purchaseRequest.update({where:{id}, data:{status:'PENDING_APPROVAL' as any}});
    });
  }

  @Post('purchase-requests/:id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async approvePR(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const pr=await tx.purchaseRequest.findFirst({where:{id, active:true}});
      if(!pr) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase request not found.'});
      if(String(pr.status)!=='PENDING_APPROVAL') throw new BadRequestException({code:'INVALID_STATUS', message:'Request is not pending approval.'});
      return tx.purchaseRequest.update({where:{id}, data:{status:'APPROVED' as any, approvedById:u.id, approvedAt:new Date()}});
    });
  }

  @Post('purchase-requests/:id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  async rejectPR(@CurrentUser() u:AuthUser, @Param('id', new ParseUUIDPipe({errorHttpStatusCode:400})) id:string, @Body() body:{reason?:string}){
    return this.prisma.withTenant(u.tenantId, async tx=>{
      const pr=await tx.purchaseRequest.findFirst({where:{id, active:true}});
      if(!pr) throw new NotFoundException({code:'NOT_FOUND', message:'Purchase request not found.'});
      if(String(pr.status)!=='PENDING_APPROVAL') throw new BadRequestException({code:'INVALID_STATUS', message:'Request is not pending approval.'});
      return tx.purchaseRequest.update({where:{id}, data:{status:'REJECTED' as any, rejectedById:u.id, rejectedAt:new Date(), rejectReason: String(body?.reason||'')}});
    });
  }

}
