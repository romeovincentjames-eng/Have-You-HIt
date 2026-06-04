import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_FLAG = "--yes-delete-everything";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(".env.local"));
loadEnvFile(resolve(".env"));

if (!process.argv.includes(REQUIRED_FLAG)) {
  console.error(`Refusing to run. Add ${REQUIRED_FLAG} to permanently wipe the app.`);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add the service role key to .env.local before running this.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function deleteRows(table, idColumn = "id") {
  const { error } = await supabase
    .from(table)
    .delete()
    .neq(idColumn, "00000000-0000-0000-0000-000000000000");

  if (error) throw new Error(`Could not delete ${table}: ${error.message}`);
  console.log(`Deleted ${table}`);
}

async function listStorageFiles(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.id === null) {
        paths.push(...(await listStorageFiles(bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function deleteStorageBucketContents(bucket) {
  const files = await listStorageFiles(bucket);

  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`Could not delete files from ${bucket}: ${error.message}`);
  }

  console.log(`Deleted ${files.length} storage file(s) from ${bucket}`);
}

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw new Error(`Could not list auth users: ${error.message}`);

    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function deleteAuthUsers() {
  const users = await listAllUsers();

  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Could not delete auth user ${user.id}: ${error.message}`);
  }

  console.log(`Deleted ${users.length} auth user(s)`);
}

try {
  console.log("Starting permanent app wipe...");

  await deleteStorageBucketContents("photos");
  await deleteRows("comments");
  await deleteRows("votes");
  await deleteRows("flags");
  await deleteRows("memberships", "user_id");
  await deleteRows("posts");
  await deleteRows("profiles");
  await deleteAuthUsers();

  console.log("Wipe complete.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
