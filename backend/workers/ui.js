// workers/agenda.ui.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Agenda from "agenda";
import Agendash from "agendash";

dotenv.config();

const app = express();
const PORT = process.env.AGENDA_UI_PORT || 5050;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/afued_db";

let agendaInstance;

async function initAgenda() {
  if (agendaInstance) return agendaInstance;

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("[MongoDB] Connected for Agendash UI");

  agendaInstance = new Agenda({ mongo: mongoose.connection, db: { collection: "agendaJobs" } });
  await agendaInstance.start();
  console.log("[Agendash] Agenda instance started for UI");
  return agendaInstance;
}

(async () => {
  const agenda = await initAgenda();

  // Mount Agendash
  app.use("/agenda", Agendash(agenda));
  app.listen(PORT, () => console.log(`[Agendash] UI running at http://localhost:${PORT}/agenda`));
})();
