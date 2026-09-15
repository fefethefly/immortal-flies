import { mkdir, writeFile, readFile, appendFile, access, constants, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** 磁盘档案：data/sessions/<id>/ 与 branches / llm 审计。 */
export function createStore(dataDir) {
  const sessionsDir = join(dataDir, "sessions");
  const branchesDir = join(dataDir, "branches");
  const llmDir = join(dataDir, "llm");

  async function ensure() {
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(branchesDir, { recursive: true });
    await mkdir(llmDir, { recursive: true });
  }

  async function writable() {
    try {
      await ensure();
      await access(dataDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  function sessionPath(sessionId) {
    return join(sessionsDir, sessionId);
  }

  async function writeJson(path, value) {
    await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  }

  async function readJson(path) {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  }

  async function saveSessionMeta(sessionId, meta) {
    const dir = sessionPath(sessionId);
    await mkdir(dir, { recursive: true });
    await writeJson(join(dir, "meta.json"), meta);
  }

  async function saveArchive(sessionId, archive) {
    const dir = sessionPath(sessionId);
    await mkdir(dir, { recursive: true });
    await writeJson(join(dir, "archive.json"), archive);
  }

  async function loadArchive(sessionId) {
    return readJson(join(sessionPath(sessionId), "archive.json"));
  }

  async function saveBranch(branchId, branch) {
    await mkdir(branchesDir, { recursive: true });
    await writeJson(join(branchesDir, `${branchId}.json`), branch);
  }

  async function loadBranch(branchId) {
    return readJson(join(branchesDir, `${branchId}.json`));
  }

  async function appendLlmAudit(record) {
    await mkdir(llmDir, { recursive: true });
    await appendFile(join(llmDir, "audit.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  }

  async function listSessionIds() {
    await ensure();
    const names = await readdir(sessionsDir).catch(() => []);
    return names.filter((name) => name.startsWith("sess_"));
  }

  async function loadSessionMeta(sessionId) {
    return readJson(join(sessionPath(sessionId), "meta.json"));
  }

  async function deleteSession(sessionId) {
    await rm(sessionPath(sessionId), { recursive: true, force: true });
  }

  return {
    dataDir,
    ensure,
    writable,
    saveSessionMeta,
    saveArchive,
    loadArchive,
    loadSessionMeta,
    listSessionIds,
    deleteSession,
    saveBranch,
    loadBranch,
    appendLlmAudit,
  };
}
