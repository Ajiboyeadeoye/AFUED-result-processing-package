// import { Parser as Json2CsvParser } from "json2csv";
// import XLSX from "xlsx";

// /**
//  * ⚡ Advanced Universal Data Fetch & Export Helper
//  * ------------------------------------------------
//  * Supports:
//  *  - Pagination, Filters, Sorting, Search
//  *  - Exports as CSV, Excel, or JSON
//  *  - Exclude fields from export
//  *
//  * @param {Object} req - Express request object
//  * @param {Object} res - Express response object
//  * @param {Object} Model - Mongoose model
//  * @param {Object} [options] - Optional configuration
//  */
// export const fetchDataHelper = async (req, res, Model, options = {}) => {
//   try {
//     const payload = req.method === "GET" ? req.query : req.body;

//     const {
//       page = 1,
//       limit = 20,
//       fields,
//       search_term,
//       filter = {},
//       sort,
//       extraParams = {}, // ✅ New! 
//     } = payload;

//     const enablePagination =
//       options.enablePagination === undefined ? true : options.enablePagination;

//     // 🧱 Base Query
//     let query = {};

//     // 🧩 Merge filters
//     if (filter && typeof filter === "object") Object.assign(query, filter);
//     if (options.additionalFilters)
//       query = { ...query, ...options.additionalFilters };

//     // 🔍 Search
//     if (fields && search_term) {
//       const fieldArray = Array.isArray(fields)
//         ? fields
//         : String(fields).split(",");
//       const regex = { $regex: search_term, $options: "i" };
//       query.$or = fieldArray.map((field) => ({ [field.trim()]: regex }));
//     }

//     // ⚙️ Sort
//     const finalSort = sort || options.sort || { createdAt: -1 };

//     // 🧮 Pagination
//     const currentPage = parseInt(page);
//     const itemsPerPage = parseInt(limit);
//     const skip = (currentPage - 1) * itemsPerPage;

//     let dataQuery = Model.find(query).sort(finalSort);

//     if (enablePagination && !extraParams.asFile) {
//       dataQuery = dataQuery.skip(skip).limit(itemsPerPage);
//     }

//     let data = await dataQuery.lean().exec(); // ✅ Use lean() for plain objects

//     // ✂️ Exclude fields from result (for file export)
//     if (extraParams.excludeFields && Array.isArray(extraParams.excludeFields)) {
//       data = data.map((item) => {
//         extraParams.excludeFields.forEach((field) => delete item[field]);
//         return item;
//       });
//     }

//     // 📁 Handle file export mode
//     if (extraParams.asFile) {
//       const fileType = extraParams.fileType?.toLowerCase() || "csv";
//       const filename = `${Model.modelName}_export_${Date.now()}`;

//       if (fileType === "csv") {
//         const parser = new Json2CsvParser();
//         const csv = parser.parse(data);
//         res.header("Content-Type", "text/csv");
//         res.attachment(`${filename}.csv`);
//         return res.send(csv);
//       }

//       if (fileType === "excel" || fileType === "xlsx") {
//         const worksheet = XLSX.utils.json_to_sheet(data);
//         const workbook = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
//         const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
//         res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//         res.attachment(`${filename}.xlsx`);
//         return res.send(buffer);
//       }

//       if (fileType === "json") {
//         res.header("Content-Type", "application/json");
//         res.attachment(`${filename}.json`);
//         return res.send(JSON.stringify(data, null, 2));
//       }

//       return res.status(400).json({ message: "Invalid file type" });
//     }

//     // 📊 Pagination info
//     let pagination = null;
//     if (enablePagination && !extraParams.asFile) {
//       const totalItems = await Model.countDocuments(query);
//       const totalPages = Math.ceil(totalItems / itemsPerPage);
//       pagination = {
//         current_page: currentPage,
//         limit: itemsPerPage,
//         total_pages: totalPages,
//         total_items: totalItems,
//       };
//     }

//     // 🎯 Default JSON response
//     return res.status(200).json({
//       message: `${Model.modelName}s fetched successfully`,
//       ...(pagination ? { pagination } : {}),
//       data,
//     });
//   } catch (error) {
//     console.error("❌ fetchDataHelper Error:", error);
//     return res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };


import { Parser as Json2CsvParser } from "json2csv";
import XLSX from "xlsx";

/**
 * ⚡ Smart Universal Data Fetch & Export Helper (with Populate Support)
 */
export const fetchDataHelper = async (req, res, Model, options = {}) => {
  try {
    const payload = req.method === "GET" ? req.query : req.body;

    const {
      page = 1,
      limit = 20,
      fields,
      search_term,
      filter = {},
      sort,
      extraParams = {},
    } = payload;

    const enablePagination =
      options.enablePagination === undefined ? true : options.enablePagination;

    // 🧱 Base Query
    let query = {};

    if (filter && typeof filter === "object") Object.assign(query, filter);
    if (options.additionalFilters)
      query = { ...query, ...options.additionalFilters };

    // 🔍 Search
    if (fields && search_term) {
      const fieldArray = Array.isArray(fields)
        ? fields
        : String(fields).split(",");
      const regex = { $regex: search_term, $options: "i" };
      query.$or = fieldArray.map((field) => ({ [field.trim()]: regex }));
    }

    // ⚙️ Sort
    const finalSort = sort || options.sort || { createdAt: -1 };

    // 🧮 Pagination
    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);
    const skip = (currentPage - 1) * itemsPerPage;

    // 🧩 Main Query
    let dataQuery = Model.find(query).sort(finalSort);

    // 🧬 Populate logic (NEW)
    if (options.populate) {
      const populateArray = Array.isArray(options.populate)
        ? options.populate
        : [options.populate];

      for (const pop of populateArray) {
        dataQuery = dataQuery.populate(pop);
      }
    }

    if (enablePagination && !extraParams.asFile) {
      dataQuery = dataQuery.skip(skip).limit(itemsPerPage);
    }

    // 🧬 Auto-populate referenced fields (faculty, hod, etc.)
    if (options.autoPopulate !== false) {
      const schemaPaths = Model.schema.paths;
      for (const key in schemaPaths) {
        const path = schemaPaths[key];
        if (path.options && path.options.ref) {
          // Auto-populate if it's a reference field
          dataQuery = dataQuery.populate({
            path: key,
            select: options.populateSelect || "name",
          });
        }
      }
    }

    let data = await dataQuery.lean().exec();

    // 🪄 Flatten populated refs: { faculty_id, faculty_name }
    data = data.map((item) => {
      const flattened = { ...item };
      for (const key in item) {
        if (item[key] && typeof item[key] === "object" && item[key]._id) {
          flattened[`${key}_id`] = item[key]._id;
          flattened[`${key}_name`] = item[key].name || "";
          delete flattened[key]; // remove nested object
        }
      }
      return flattened;
    });


    // ✂️ Exclude fields if needed
    if (extraParams.excludeFields && Array.isArray(extraParams.excludeFields)) {
      data = data.map((item) => {
        extraParams.excludeFields.forEach((field) => delete item[field]);
        return item;
      });
    }

    // 📁 File export handling
    if (extraParams.asFile) {
      const fileType = extraParams.fileType?.toLowerCase() || "csv";
      const filename = `${Model.modelName}_export_${Date.now()}`;

      if (fileType === "csv") {
        const parser = new Json2CsvParser();
        const csv = parser.parse(data);
        res.header("Content-Type", "text/csv");
        res.attachment(`${filename}.csv`);
        return res.send(csv);
      }

      if (["excel", "xlsx"].includes(fileType)) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        const buffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });
        res.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.attachment(`${filename}.xlsx`);
        return res.send(buffer);
      }

      if (fileType === "json") {
        res.header("Content-Type", "application/json");
        res.attachment(`${filename}.json`);
        return res.send(JSON.stringify(data, null, 2));
      }

      return res.status(400).json({ message: "Invalid file type" });
    }

    // 📊 Pagination
    let pagination = null;
    if (enablePagination && !extraParams.asFile) {
      const totalItems = await Model.countDocuments(query);
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      pagination = {
        current_page: currentPage,
        limit: itemsPerPage,
        total_pages: totalPages,
        total_items: totalItems,
      };
    }

    // ✅ Success Response
    return res.status(200).json({
      message: `${Model.modelName}s fetched successfully`,
      ...(pagination ? { pagination } : {}),
      data,
    });
  } catch (error) {
    console.error("❌ fetchDataHelper Error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
