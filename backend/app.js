// mongodb connection
import "./config/db.js";

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import path from "path";

import routes from "./routes/index.js"; // Ensure correct path if routes has index.js
const allowedOrigins = [
  "https://adeyemi-frontend-cslixwj57-breakthrough-s-projects.vercel.app",
  "http://localhost:3000"
];
// create express app
const app = express();

app.use(cors({ origin: allowedOrigins }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(fileUpload());
app.use("/afued/result/portal", routes);

export default app;
