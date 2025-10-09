// mongodb
require("./config/db");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
fileUpload = require("express-fileupload");
const path = require("path");

const routes = require("./routes");


// create express app
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/afued/result/portal", routes);


module.exports = app;