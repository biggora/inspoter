-- LLM provider credential: one OpenAI-compatible endpoint per workspace
-- (Ollama, vLLM, LM Studio, OpenRouter, OpenAI). Base URL, model name and API
-- key live inside the existing encrypted ProviderCredential payload, so no new
-- table or column is introduced.
ALTER TYPE "ProviderType" ADD VALUE 'OPENAI_COMPATIBLE';
