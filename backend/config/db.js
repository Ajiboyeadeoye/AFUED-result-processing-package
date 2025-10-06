require("dotenv").config();
const mongoose = require("mongoose");


// uri
const { MONGODB_URI, MONGODB_URI2 } = process.env;

// connect to db
const connectToDB = async () => {
    try {
        //console.log("Connecting with URI:", MONGODB_URI);
        await mongoose.connect(MONGODB_URI2);
        console.log("Connected to MongoDB"); 
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
};

connectToDB();



