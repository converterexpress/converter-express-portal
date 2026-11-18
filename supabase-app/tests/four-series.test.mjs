import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project} from '../supabase/functions/_shared/business.mjs';

const oldSeries=['Universal Converters — 4003 Series','Universal Converters — 4004 Series','Universal Converters — 4005 Series','Universal Converters — 4006 Series','Universal Converters — 4009 Series'];
const source=()=>({accounts:[],orders:[],products:[],discountCodes:[],storeSettings:{shippingFlatCents:0,taxRatePercent:0,customSeries:[...oldSeries],deletedSeries:[]},crm:{quotes:[],tasks:[],purchases:[],inventory:{},activities:[]}});

test('catalog migration consolidates the approved 4000 parts into one priced 4000 Series',()=>{const data=source();data.storeSettings.customSeries.push('Universal Converters — 4 Series');const result=project(data,{id:'admin',email:'admin@example.test',admin:true}).data,parts=result.products.filter(p=>['4003','4004','4005','4006','4009'].includes(p.partNumber));assert.deepEqual(parts.map(p=>p.partNumber),['4003','4004','4005','4006','4009']);for(const part of parts){assert.equal(part.category,'Universal Converters — 4000 Series');assert.equal(part.priceCents,33000);assert.equal(part.pricePending,false);assert.equal(part.manufacturer,'Converter Unlimited');assert.equal(part.approvalManufacturer,'Converter Unlimited, Inc.');assert.match(part.description,/D-724-6/);}assert(result.storeSettings.customSeries.includes('Universal Converters — 4000 Series'));assert(!result.storeSettings.customSeries.includes('Universal Converters — 4 Series'));assert(oldSeries.every(series=>!result.storeSettings.customSeries.includes(series)));});

test('frontend exposes one 4000 Series category rather than five empty category cards',()=>{const html=fs.readFileSync(new URL('../converter-express_1.html',import.meta.url),'utf8'),categoryBlock=html.slice(html.indexOf('const CATEGORY_ORDER'),html.indexOf('function categoryRank'));assert.match(categoryBlock,/Universal Converters — 4000 Series/);assert.doesNotMatch(categoryBlock,/Universal Converters — 4 Series/);for(const series of oldSeries)assert.doesNotMatch(categoryBlock,new RegExp(series));});
