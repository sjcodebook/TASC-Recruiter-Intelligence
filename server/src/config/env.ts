import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .default("postgresql://tasc:tasc_local@localhost:54329/tasc_match"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small")
});

export const env = EnvSchema.parse(process.env);
export const EMBEDDING_DIMENSIONS = 256;
