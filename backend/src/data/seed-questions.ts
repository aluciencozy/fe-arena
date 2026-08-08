import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { QUESTION_BANK, validateQuestionBank } from "./questions.js";
import { questionToRow } from "../services/question-bank.service.js";

const url = process.env.SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required to seed the reviewed question bank.");
}

const questions = validateQuestionBank(QUESTION_BANK);
const rows = questions.map((question) => ({ ...questionToRow(question), schema_version: 5 }));
const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error } = await client.from("question_bank").upsert(rows, { onConflict: "id" });
if (error) throw new Error(`Question-bank seed failed: ${error.message}`);
const { data: retired, error: retirementError } = await client
  .from("question_bank")
  .update({ published: false, updated_at: new Date().toISOString() })
  .eq("published", true)
  .like("id", "q-fe-%")
  .select("id");
if (retirementError) throw new Error(`Legacy question retirement failed: ${retirementError.message}`);
console.log(`Seeded ${rows.length} reviewed questions and retired ${retired?.length ?? 0} legacy rows idempotently.`);
