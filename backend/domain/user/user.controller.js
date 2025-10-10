const User = require("./user.model");
const { hashData, verifyHashedData } = require("../../utils/hashData");
const createToken = require("../../utils/createToken");


const authenticateUser = async (data) => {
    try {
        const { email, password } = data;

        // checking if the user already exists
        const fectchedUser = await User.findOne({ email });
        if (!fectchedUser) {
            throw Error("User with the provided email does not exist, try signing up!");
        };

        const hashedPassword = fectchedUser.password;
        // compare password
        const passwordMatch = await verifyHashedData(password, hashedPassword);

        if (!passwordMatch) {
            throw Error ("Invalid password")
        };

        // create user token for login
        const tokenData = { userId: fectchedUser._id, email, role: fectchedUser.role };
        console.log("Role", fectchedUser.role)
        const token = await createToken(tokenData);

        // assign user a token
        fectchedUser.token = token;
        return fectchedUser;
    } catch(error) {
        throw error;
    }
};

const createNewUser = async (data) => {
    try {
        const { name, email, password, role } = data;

        // checking if the user already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw Error("User with this email already exist, please login...")
        }


        // hash password
        const hashedpassword = await hashData(password);

        // user data to be saved
        const newUser = new User({
            name,
            email,
            password: hashedpassword,
        });
        // save user
        const createdUser = await newUser.save();
        return createdUser;
    } catch (error){
        throw error;
    }
};


module.exports = { createNewUser, authenticateUser };