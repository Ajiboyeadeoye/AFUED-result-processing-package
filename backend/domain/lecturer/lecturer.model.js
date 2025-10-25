import mongoose from "mongoose";

const lecturerSchema = new mongoose.Schema(
  {
    // Use the same _id as the User document for strict one-to-one mapping
    _id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    staffId: { 
      type: String, 
      required: true, 
      unique: true 
    },

    departmentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Department", 
      required: true 
    },

    rank: {
      type: String,
      enum: [
        "assistant_lecturer",
        "lecturer_ii",
        "lecturer_i",
        "senior_lecturer",
        "associate_professor",
        "professor"
      ],
      default: "lecturer_ii"
    },

    isHOD: { 
      type: Boolean, 
      default: false 
    },

    active: { 
      type: Boolean, 
      default: true 
    },

    deletedAt: { 
      type: Date, 
      default: null 
    },
  },
  { timestamps: true , _id: false }
);

// // Automatically populate linked user info when fetching lecturers
// lecturerSchema.pre(/^find/, function (next) {
//   this.populate("_id", "name email role"); // get minimal user info
//   next();
// });

export default mongoose.model("Lecturer", lecturerSchema);
