import { MongoClient } from "mongodb";

const uri = "mongodb+srv://aloyebolu5_db_user:cqnNUCFSWJEAkP6M@cluster0.xvrubps.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("📌 Connected!");

    console.log("\n📚 Listing all databases...");
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    console.log(dbs);

    for (const db of dbs.databases) {
      const dbName = db.name;
      console.log(`\n📦 Collections in database: ${dbName}`);
      const collections = await client.db(dbName).listCollections().toArray();
      console.log(collections);
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
    console.log("\n🔌 Connection closed.");
  }
}

run();
