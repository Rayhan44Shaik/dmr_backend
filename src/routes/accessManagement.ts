import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../config/db.js";
import { authUser } from "../middleware/auth.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { hashPassword, verifyPassword } from "../utils/passwordHash.js";

export const accessManagementRouter=Router();
const ROLES=["FULL_ACCESS","AUDIT","OFFICE","COLLECTION","SUPERVISOR"] as const;
const STATUSES=["NOT_GRANTED","ACTIVE","PAUSED","REVOKED"] as const;
const grantSchema=z.object({employeeId:z.number().int().positive(),role:z.enum(ROLES)}).strict();
const pageSchema=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(25),search:z.string().trim().max(100).default(""),role:z.enum(ROLES).optional(),accessStatus:z.string().trim().max(100).optional().transform(v=>v?v.split(",").map(s=>s.trim()).filter(s=>(STATUSES as readonly string[]).includes(s)):undefined),employeeStatus:z.enum(["Active","Inactive","Suspended"]).optional(),lastAccessChange:z.coerce.boolean().optional(),sort:z.enum(["employee_asc","employee_desc","last_login_desc","access_change_desc"]).default("employee_asc")});

function viewer(res:{locals:Record<string,unknown>}){const u=authUser(res);if(u.role!=="OWNER"&&u.role!=="FULL_ACCESS")throw new AppError(403,"Access Management permission is required");return u}
function owner(res:{locals:Record<string,unknown>}){const u=authUser(res);if(u.role!=="OWNER")throw new AppError(403,"Owner access is required");return u}
const tempPassword=()=>`${randomBytes(9).toString("base64url")}aA7!`;
const usernameFor=(employeeName:string,employeeNo:number)=>employeeName.normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toUpperCase()||`EMPLOYEE${employeeNo}`;
const starterPasswordFor=(username:string)=>`${username.toLowerCase().padEnd(5,"x")}@dmr123`;
const safeId=(raw:string)=>{const id=Number(raw);if(!Number.isSafeInteger(id)||id<1)throw new AppError(400,"Invalid user id");return id};
const meta=(req:{ip?:string},res:{locals:Record<string,unknown>})=>({ip:req.ip??null,requestId:typeof res.locals.requestId==="string"?res.locals.requestId:null});
// One WHERE clause, two uses: the paged page of rows and the whole-filtered-set
// summary. Keeping them in lockstep means the Settings KPI tiles can never
// disagree with the table underneath them.
// USER-FIRST directory: every application login appears — including the
// OWNER/FULL_ACCESS accounts that have no employees row (previously invisible
// because the join started from employees). The employees row is a LEFT JOIN
// enrichment (name, no, department, phone, status) with the login's display
// name standing in for account-only rows.
const DIRECTORY_FROM=`FROM application_users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN mfa_factors f ON f.user_id=u.id`;
const ACCESS_FILTER_SQL=`($1='' OR COALESCE(e.employee_name,u.display_name) ILIKE '%'||$1||'%' OR e.employee_no::text ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%') AND ($2::text IS NULL OR u.role=$2) AND ($3::text[] IS NULL OR cardinality($3::text[])=0 OR COALESCE(u.access_status,'NOT_GRANTED')=ANY($3::text[])) AND ($4::text IS NULL OR e.status::text=$4)`;

accessManagementRouter.get("/employees",asyncHandler(async(req,res)=>{viewer(res);const parsed=pageSchema.safeParse(req.query);if(!parsed.success)throw new AppError(400,"Invalid access list filters");const p=parsed.data;
  const order={employee_asc:"COALESCE(e.employee_name,u.display_name) ASC",employee_desc:"COALESCE(e.employee_name,u.display_name) DESC",last_login_desc:"u.last_login_at DESC NULLS LAST",access_change_desc:"u.last_access_change_at DESC NULLS LAST"}[p.sort];
  // `lastAccessChange=true` (or a legacy client) keeps last_access_change_at in
  // the payload; the current UI hides the column, so it is omitted by default.
  const includeAccessChange = p.lastAccessChange === true;
  const result=await query(`SELECT e.id AS employee_id,e.employee_no,COALESCE(e.employee_name,u.display_name) AS employee_name,e.department,e.phone_number,e.status AS employee_status,u.id AS user_id,u.username,u.role,COALESCE(u.access_status,'NOT_GRANTED') AS access_status,u.last_login_at,u.last_password_reset_at,${includeAccessChange ? "u.last_access_change_at," : ""}u.must_change_password,COALESCE(f.active,FALSE) AS mfa_enabled,COUNT(*) OVER() AS total ${DIRECTORY_FROM} WHERE ${ACCESS_FILTER_SQL} ORDER BY ${order} LIMIT $5 OFFSET $6`,[p.search,p.role??null,p.accessStatus??null,p.employeeStatus??null,p.pageSize,(p.page-1)*p.pageSize]);
  const filters=[p.search,p.role??null,p.accessStatus&&p.accessStatus.length?p.accessStatus:null,p.employeeStatus??null];
  const summaryResult=await query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE COALESCE(u.access_status,'NOT_GRANTED')='ACTIVE')::int AS active,COUNT(*) FILTER (WHERE COALESCE(u.access_status,'NOT_GRANTED')='PAUSED')::int AS paused,COUNT(*) FILTER (WHERE COALESCE(u.access_status,'NOT_GRANTED')='REVOKED')::int AS revoked,COUNT(*) FILTER (WHERE COALESCE(u.access_status,'NOT_GRANTED')='NOT_GRANTED')::int AS not_granted,COUNT(*) FILTER (WHERE u.last_password_reset_at IS NOT NULL)::int AS password_changed,COUNT(*) FILTER (WHERE u.must_change_password IS TRUE)::int AS must_change_password,COUNT(*) FILTER (WHERE COALESCE(f.active,FALSE))::int AS mfa_enabled,COUNT(*) FILTER (WHERE COALESCE(u.access_status,'NOT_GRANTED')='ACTIVE' AND COALESCE(u.last_password_reset_at,to_timestamp(0)) < NOW()-INTERVAL '90 days')::int AS expired,MAX(u.last_password_reset_at) AS last_password_change_at,MAX(u.last_access_change_at) AS last_access_change_at ${DIRECTORY_FROM} WHERE ${ACCESS_FILTER_SQL}`,filters);
  const s=summaryResult.rows[0]??{};
  const total=Number(s.total??result.rows[0]?.total??0);res.json({rows:result.rows,page:p.page,pageSize:p.pageSize,total,totalPages:Math.max(1,Math.ceil(total/p.pageSize)),summary:{total,active:Number(s.active??0),paused:Number(s.paused??0),revoked:Number(s.revoked??0),notGranted:Number(s.not_granted??0),passwordChanged:Number(s.password_changed??0),mustChangePassword:Number(s.must_change_password??0),mfaEnabled:Number(s.mfa_enabled??0),expired:Number(s.expired??0),lastPasswordChangeAt:s.last_password_change_at??null,lastAccessChangeAt:s.last_access_change_at??null}})}));

accessManagementRouter.get("/eligible-employees",asyncHandler(async(_req,res)=>{owner(res);const result=await query(`SELECT e.id,e.employee_no,e.employee_name,e.department,e.phone_number,e.status FROM employees e LEFT JOIN application_users u ON u.employee_id=e.id WHERE e.status='Active' AND (u.id IS NULL OR u.access_status='REVOKED') ORDER BY e.employee_name LIMIT 500`);res.json({rows:result.rows})}));

accessManagementRouter.get("/:userId/login-history",asyncHandler(async(req,res)=>{viewer(res);const id=safeId(req.params.userId);const page=Math.max(1,Number(req.query.page)||1),pageSize=Math.min(50,Math.max(10,Number(req.query.pageSize)||20));const result=await query(`SELECT id,created_at,event,COALESCE(result,CASE WHEN event='login_failure' THEN 'FAILURE' ELSE 'SUCCESS' END) AS result,ip,user_agent,session_id,COUNT(*) OVER() AS total FROM auth_audit_logs WHERE user_id=$1 OR username=(SELECT username FROM application_users WHERE id=$1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`,[id,pageSize,(page-1)*pageSize]);const total=Number(result.rows[0]?.total??0);res.json({rows:result.rows,page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))})}));
accessManagementRouter.get("/:userId/security-history",asyncHandler(async(req,res)=>{viewer(res);const id=safeId(req.params.userId);const page=Math.max(1,Number(req.query.page)||1),pageSize=Math.min(50,Math.max(10,Number(req.query.pageSize)||20));const result=await query(`SELECT s.id,s.created_at,s.event,s.details,a.display_name AS performed_by,COUNT(*) OVER() AS total FROM access_security_events s LEFT JOIN application_users a ON a.id=s.actor_user_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`,[id,pageSize,(page-1)*pageSize]);const total=Number(result.rows[0]?.total??0);res.json({rows:result.rows,page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))})}));

accessManagementRouter.post("/grant",asyncHandler(async(req,res)=>{
  const actor=owner(res),parsed=grantSchema.safeParse(req.body);
  if(!parsed.success)throw new AppError(400,"An active employee and assignable role are required");
  const found=await query(`SELECT id,employee_no,employee_name,status FROM employees WHERE id=$1`,[parsed.data.employeeId]);
  const e=found.rows[0];
  if(!e||e.status!=="Active")throw new AppError(409,"Only active employees can receive login access");
  const baseUsername=usernameFor(String(e.employee_name),Number(e.employee_no));
  const conflict=await query(`SELECT employee_id FROM application_users WHERE LOWER(username)=LOWER($1) AND employee_id IS DISTINCT FROM $2 LIMIT 1`,[baseUsername,e.id]);
  const username=conflict.rowCount?`${baseUsername}${e.employee_no}`:baseUsername;
  const password=starterPasswordFor(username),hash=await hashPassword(password),m=meta(req,res);
  const saved=await withTransaction(async c=>{
    const before=await c.query(`SELECT id,role,access_status FROM application_users WHERE employee_id=$1 FOR UPDATE`,[e.id]);
    const result=await c.query(`INSERT INTO application_users(username,display_name,password_hash,reveal_password,role,employee_id,active,access_status,must_change_password,last_password_reset_at,access_granted_by,access_granted_at,last_access_change_at) VALUES($1,$2,$3,$4,$5,$6,TRUE,'ACTIVE',TRUE,NOW(),$7,NOW(),NOW()) ON CONFLICT(employee_id) WHERE employee_id IS NOT NULL DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,reveal_password=EXCLUDED.reveal_password,role=EXCLUDED.role,active=TRUE,access_status='ACTIVE',must_change_password=TRUE,last_password_reset_at=NOW(),access_granted_by=$7,access_granted_at=NOW(),last_access_change_at=NOW(),updated_at=NOW() RETURNING id,username,display_name,role,access_status`,[username,e.employee_name,hash,password,parsed.data.role,e.id,actor.id]);
    const u=result.rows[0];
    const revoked=await c.query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,[u.id]);
    await c.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,'ACCESS_GRANTED',jsonb_build_object('previousState',$3::text,'newState','ACTIVE','previousRole',$4::text,'newRole',$5::text,'sessionsInvalidated',$6::int),$7,$8)`,[u.id,actor.id,before.rows[0]?.access_status??"NOT_GRANTED",before.rows[0]?.role??null,parsed.data.role,revoked.rowCount??0,m.requestId,m.ip]);
    return u;
  });
  res.status(201).json({user:saved,temporaryPassword:password,mustChangePassword:true});
}));

accessManagementRouter.post("/:userId/access",asyncHandler(async(req,res)=>{const actor=owner(res),id=safeId(req.params.userId),parsed=z.object({action:z.enum(["PAUSE","RESUME","REVOKE"]),reason:z.string().trim().max(500).optional()}).strict().safeParse(req.body);if(!parsed.success)throw new AppError(400,"Invalid access change");const next={PAUSE:"PAUSED",RESUME:"ACTIVE",REVOKE:"REVOKED"}[parsed.data.action],m=meta(req,res);const changed=await withTransaction(async c=>{const prior=await c.query(`SELECT access_status FROM application_users WHERE id=$1 AND role<>'OWNER' FOR UPDATE`,[id]);if(!prior.rowCount)throw new AppError(404,"Employee login was not found");// $2 is cast explicitly: Postgres cannot deduce one type for a parameter used
// both as a varchar column value and in a text comparison (42P08). Sessions are
// only invalidated on REVOKE — a paused employee keeps any signed-in session
// (and their current password) until the owner revokes or resets them.
const result=await c.query(`UPDATE application_users SET access_status=$2::text,active=($2::text<>'REVOKED'),last_access_change_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,access_status`,[id,next]);const revoked=next==="REVOKE"?await c.query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,[id]):{rowCount:0};await c.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,$3,jsonb_build_object('previousState',$4::text,'newState',$5::text,'reason',$6::text,'sessionsInvalidated',$7::int),$8,$9)`,[id,actor.id,`ACCESS_${parsed.data.action}D`,prior.rows[0].access_status,next,parsed.data.reason??null,revoked.rowCount??0,m.requestId,m.ip]);return result.rows[0]});res.json(changed)}));

// Viewing an employee's password is a two-step owner action: the owner must
// re-enter THEIR OWN login password, verified against the stored scrypt hash.
// When the application generated the current password (grant / owner reset) a
// copy lives in reveal_password and is shown WITHOUT rotating — the password
// the owner set is what comes back, every time. When the user set their own
// password (copy cleared) the only way to restore visibility is a fresh
// reset, so the endpoint rotates and stores the new copy. Every reveal is
// audit-logged; sessions are only signed out when a rotation happens.
accessManagementRouter.post("/:userId/reveal-password",asyncHandler(async(req,res)=>{const actor=owner(res),id=safeId(req.params.userId),parsed=z.object({actorPassword:z.string().min(1).max(1024)}).strict().safeParse(req.body);if(!parsed.success)throw new AppError(400,"Enter your login password to continue");const actorHash=await query(`SELECT password_hash FROM application_users WHERE id=$1`,[actor.id]);if(!actorHash.rowCount||!(await verifyPassword(parsed.data.actorPassword,actorHash.rows[0].password_hash)))throw new AppError(401,"Your login password is incorrect");const m=meta(req,res);const stored=await query(`SELECT username,reveal_password FROM application_users WHERE id=$1 AND role<>'OWNER'`,[id]);if(!stored.rowCount)throw new AppError(404,"Employee login was not found");const knownPassword=stored.rows[0].reveal_password?String(stored.rows[0].reveal_password):null;
  // Copy exists → reveal it as-is, no rotation, no session loss.
  if(knownPassword){await query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,'PASSWORD_REVEALED',jsonb_build_object('rotated',FALSE),$3,$4)`,[id,actor.id,m.requestId,m.ip]);return res.json({user:{id:parseInt(String(id),10),username:String(stored.rows[0].username)},password:knownPassword,mustChangePassword:false})}
  // No copy (user set their own password) → rotate and store the new copy.
  const password=tempPassword(),hash=await hashPassword(password);const changed=await withTransaction(async c=>{const result=await c.query(`UPDATE application_users SET password_hash=$2,reveal_password=$3,must_change_password=TRUE,last_password_reset_at=NOW(),updated_at=NOW() WHERE id=$1 AND role<>'OWNER' RETURNING id,username`,[id,hash,password]);if(!result.rowCount)throw new AppError(404,"Employee login was not found");const revoked=await c.query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,[id]);await c.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,'PASSWORD_REVEALED',jsonb_build_object('rotated',TRUE,'sessionsInvalidated',$3::int),$4,$5)`,[id,actor.id,revoked.rowCount??0,m.requestId,m.ip]);return result.rows[0]});res.json({user:changed,password,mustChangePassword:true})}));

accessManagementRouter.patch("/:userId/role",asyncHandler(async(req,res)=>{const actor=owner(res),id=safeId(req.params.userId),parsed=z.object({role:z.enum(ROLES),reason:z.string().trim().max(500).optional()}).strict().safeParse(req.body);if(!parsed.success)throw new AppError(400,"Invalid role change");const m=meta(req,res);const changed=await withTransaction(async c=>{const prior=await c.query(`SELECT role FROM application_users WHERE id=$1 AND role<>'OWNER' FOR UPDATE`,[id]);if(!prior.rowCount)throw new AppError(404,"Employee login was not found");const result=await c.query(`UPDATE application_users SET role=$2,last_access_change_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,role`,[id,parsed.data.role]);const revoked=await c.query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,[id]);await c.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,'ROLE_CHANGED',jsonb_build_object('previousState',$3::text,'newState',$4::text,'reason',$5::text,'sessionsInvalidated',$6::int),$7,$8)`,[id,actor.id,prior.rows[0].role,parsed.data.role,parsed.data.reason??null,revoked.rowCount??0,m.requestId,m.ip]);return result.rows[0]});res.json(changed)}));

accessManagementRouter.post("/:userId/reset-password",asyncHandler(async(req,res)=>{const actor=owner(res),id=safeId(req.params.userId),password=tempPassword(),hash=await hashPassword(password),m=meta(req,res);const changed=await withTransaction(async c=>{const result=await c.query(`UPDATE application_users SET password_hash=$2,reveal_password=$3,must_change_password=TRUE,last_password_reset_at=NOW(),updated_at=NOW() WHERE id=$1 AND role<>'OWNER' RETURNING id,username`,[id,hash,password]);if(!result.rowCount)throw new AppError(404,"Employee login was not found");const revoked=await c.query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,[id]);await c.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details,request_id,ip) VALUES($1,$2,'PASSWORD_RESET',jsonb_build_object('sessionsInvalidated',$3::int),$4,$5)`,[id,actor.id,revoked.rowCount??0,m.requestId,m.ip]);return result.rows[0]});res.json({user:changed,temporaryPassword:password,mustChangePassword:true})}));
