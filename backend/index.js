// index.js or server entry
import dotenv from "dotenv";
import app from "./app.js";
// import { connectDB } from "./db.js";
import Agendash from "agendash";
import connectToDB from "./config/db.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
// const PORT = 5001;
const HOST = "0.0.0.0";

async function startApp() {
  try {
    console.log("Step 1: Connecting to DB...");
    await connectToDB();
    console.log("Step 1 done.");

    // console.log("Step 2: Initializing Agenda...");
    // const agenda = await initDepartmentWorker();
    // console.log("Step 2 done.");

    // console.log("Step 3: Mounting Agendash...");
    // app.use("/agenda", Agendash(agenda));
    // console.log("Step 3 done.");

    console.log("Starting server...");
    app.listen(PORT, HOST, () => {
      console.log(`Server running at http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}


startApp();
