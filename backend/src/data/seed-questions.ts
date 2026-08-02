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
const rows = questions.map((question) => ({ ...questionToRow(question), schema_version: 4, published: true }));
const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error } = await client.from("question_bank").upsert(rows, { onConflict: "id" });
if (error) throw new Error(`Question-bank seed failed: ${error.message}`);
console.log(`Seeded ${rows.length} reviewed questions idempotently.`);
