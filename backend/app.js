// mongodb
require("./config/db");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const path = require("path");

const routes = require("./routes");
const authenticate = require("./middlewares/authenticate"); // ✅ import middleware

// create express app
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(fileUpload());

// ✅ Run authentication before all routes
app.use(authenticate());

// ✅ All your protected routes go under here
app.use("/afued/result/portal", routes);

module.exports = app;
