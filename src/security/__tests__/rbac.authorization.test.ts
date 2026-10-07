import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_ROLES, hasPermission } from "../rbac.js";
import { roleBoundary } from "../../middleware/roleBoundary.js";

const allowed = (role: string, method: string, path: string) => new Promise<number>((resolve) => {
  const req={method,path} as never; const res={locals:{authUser:{role}}} as never;
  try { roleBoundary(req,res,(e?:unknown)=>resolve((e as {status?:number})?.status??200)); } catch(e){resolve((e as {status?:number}).status??500)}
});

describe("authoritative six-role RBAC",()=>{
  it("contains exactly the production roles",()=>assert.deepEqual([...APP_ROLES],["OWNER","FULL_ACCESS","AUDIT","OFFICE","COLLECTION","SUPERVISOR"]));
  it("Supervisor is trip-entry only",()=>{assert.equal(hasPermission("SUPERVISOR","trip.create"),true);assert.equal(hasPermission("SUPERVISOR","trip.submit"),true);assert.equal(hasPermission("SUPERVISOR","trip.delete"),false)});
  it("Office completes trips but cannot approve maintenance",()=>{assert.equal(hasPermission("OFFICE","trip.complete"),true);assert.equal(hasPermission("OFFICE","maintenance.approve"),false)});
  it("Collection creates but cannot approve collections",()=>{assert.equal(hasPermission("COLLECTION","collection.create"),true);assert.equal(hasPermission("COLLECTION","collection.approve"),false)});
  it("Audit is read only at the API boundary",async()=>{assert.equal(await allowed("AUDIT","GET","/operations/collections"),200);for(const method of ["POST","PUT","PATCH","DELETE"])assert.equal(await allowed("AUDIT",method,"/operations/collections"),403)});
  it("Full Access reaches the dedicated owner guard (coarse boundary does not impersonate owner)",async()=>assert.equal(await allowed("FULL_ACCESS","POST","/access-management/grant"),200));
  it("restricted roles cannot self-escalate",async()=>{for(const role of ["SUPERVISOR","OFFICE","COLLECTION","AUDIT"])assert.equal(await allowed(role,"PATCH","/access-management/1/role"),403)});
});
