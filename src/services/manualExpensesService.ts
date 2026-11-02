import { z } from "zod";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly } from "../utils/coerce.js";

const manualExpenseSchema = z.object({
  expenseDate: z.string().date(),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  expenseType: z.enum(["Office", "Employee", "Utilities", "Supplies", "Repairs", "Travel", "Food", "Other"]),
  description: z.string().trim().min(2).max(300),
  remarks: z.string().trim().max(1000).optional().default(""),
}).strict();

function mapRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    expenseNo: String(row.expense_no),
    expenseDate: dateOnly(row.expense_date) ?? "",
    amount: Number(row.amount),
    expenseType: String(row.expense_type),
    description: String(row.description),
    remarks: row.remarks == null ? "" : String(row.remarks),
    createdBy: String(row.created_by ?? ""),
    createdAt: row.created_at == null ? null : String(row.created_at),
    status: String(row.status ?? "Pending"),
    approvedBy: row.approved_by == null ? null : String(row.approved_by),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
  };
}

export const manualExpensesService = {
  async create(body: unknown, createdBy: string) {
    const parsed = manualExpenseSchema.safeParse(body);
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid expense");
    return withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('manual_expense_number'))`);
      const yearMonth = parsed.data.expenseDate.slice(0, 7).replace("-", "");
      const next = await client.query<{ n: number }>(
        `SELECT COALESCE(MAX((regexp_match(expense_no, '(\\d+)$'))[1]::int),0)+1 AS n
           FROM manual_expenses WHERE expense_no LIKE $1`,
        [`EXP-${yearMonth}-%`],
      );
      const expenseNo = `EXP-${yearMonth}-${String(next.rows[0]?.n ?? 1).padStart(4, "0")}`;
      const result = await client.query(
        `INSERT INTO manual_expenses (expense_no,expense_date,amount,expense_type,description,remarks,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [expenseNo, parsed.data.expenseDate, parsed.data.amount, parsed.data.expenseType, parsed.data.description, parsed.data.remarks || null, createdBy],
      );
      return mapRow(result.rows[0]);
    });
  },

  async list(filters: { fromDate?: string; toDate?: string; search?: string } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => { params.push(value); clauses.push(sql.replace("?", `$${params.length}`)); };
    if (filters.fromDate) add("expense_date>=?::date", filters.fromDate);
    if (filters.toDate) add("expense_date<=?::date", filters.toDate);
    if (filters.search) add("(expense_no ILIKE '%'||?||'%' OR expense_type ILIKE '%'||$" + (params.length + 1) + "||'%' OR description ILIKE '%'||$" + (params.length + 1) + "||'%')", filters.search);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(`SELECT * FROM manual_expenses ${where} ORDER BY expense_date DESC,id DESC LIMIT 2000`, params);
    return result.rows.map(mapRow);
  },

  async update(id: number, body: unknown) {
    const parsed = manualExpenseSchema.safeParse(body);
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid expense");
    const result = await query(
      `UPDATE manual_expenses SET expense_date=$2,amount=$3,expense_type=$4,description=$5,remarks=$6,updated_at=NOW()
       WHERE id=$1 AND status='Pending' AND created_at >= NOW()-INTERVAL '14 days' RETURNING *`,
      [id, parsed.data.expenseDate, parsed.data.amount, parsed.data.expenseType, parsed.data.description, parsed.data.remarks || null],
    );
    if (!result.rowCount) {
      const exists = await query(`SELECT 1 FROM manual_expenses WHERE id=$1`, [id]);
      throw new AppError(exists.rowCount ? 409 : 404, exists.rowCount ? "Only pending manual expenses can be edited within 14 days of entry." : "Manual expense not found");
    }
    return mapRow(result.rows[0]);
  },

  async remove(id: number) {
    const result = await query(`DELETE FROM manual_expenses WHERE id=$1 AND status='Pending' AND created_at >= NOW()-INTERVAL '14 days' RETURNING id`, [id]);
    if (!result.rowCount) {
      const exists = await query(`SELECT 1 FROM manual_expenses WHERE id=$1`, [id]);
      throw new AppError(exists.rowCount ? 409 : 404, exists.rowCount ? "Only pending manual expenses can be deleted within 14 days of entry." : "Manual expense not found");
    }
    return { id, deleted: true };
  },

  async approve(id: number, approvedBy: string) {
    const result = await query(
      `UPDATE manual_expenses SET status='Approved',approved_by=$2,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND status='Pending' RETURNING *`,
      [id, approvedBy],
    );
    if (!result.rowCount) {
      const exists = await query(`SELECT 1 FROM manual_expenses WHERE id=$1`, [id]);
      throw new AppError(exists.rowCount ? 409 : 404, exists.rowCount ? "Expense is already approved." : "Manual expense not found");
    }
    return mapRow(result.rows[0]);
  },
};
