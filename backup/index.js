import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

const { PORT } = process.env;
const HOST = '0.0.0.0';

const startApp = () => {
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on port ${PORT}, ${HOST}`);
  });
};

startApp();
