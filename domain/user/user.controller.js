const User = require("./user.model");
const { hashData } = require("./../../utils/hashData")


const createNewUser = async (data) => {
    try {
        const { name, email, password, role } = data;

        // checking if the user already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw Error("User with the provided email alreay exist, try log in!");
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


module.exports = { createNewUser };